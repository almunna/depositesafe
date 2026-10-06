import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock3, Download, ExternalLink, LoaderCircle, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  downloadCredasDocument,
  getGetCredasChecksQueryKey,
  getGetTransactionQueryKey,
  type CredasCheck,
  type CredasCheckState,
  type CredasComponentResult,
  type CredasMatch,
  type CredasOutcome,
  type Transaction,
  useCreateCredasJourneyLink,
  useGetCredasChecks,
  useRefreshCredasChecks,
  useResendCredasInvite,
  useRunCredasBankAccountCheck,
  useRunCredasPropertyCheck,
  useSelectCredasPropertyTitle,
  useStartCredasVerification,
} from '@workspace/api-client-react';
import { CredasJourneyFrame, trustedJourneyUrl } from '@/components/credas-journey-frame';

const POLL_INTERVAL_MS = 20_000;

/** The API returns customer-safe messages; anything else falls back to a generic line. */
function errorMessage(error: unknown, fallback: string): string {
  const data = typeof error === 'object' && error !== null && 'data' in error ? (error as { data: unknown }).data : null;
  const message = typeof data === 'object' && data !== null && 'error' in data ? (data as { error: unknown }).error : null;
  return typeof message === 'string' && message.trim() && message.length <= 200 ? message : fallback;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const outcomeCopy: Record<CredasOutcome, { label: string; detail: string; tone: string }> = {
  pass: { label: 'Passed', detail: 'The check completed without any issues being raised.', tone: 'border-[#c7dfd1] bg-[#e4f0e9] text-[#276952]' },
  refer: { label: 'Referred', detail: 'The check could not be fully confirmed. Review the details before you rely on it.', tone: 'border-[#ead9aa] bg-[#f8efd7] text-[#7a5d1c]' },
  fail: { label: 'Not passed', detail: 'The check did not pass. Review the details below.', tone: 'border-[#eacdc3] bg-[#f7e9e3] text-[#95463d]' },
};

const kindCopy: Record<CredasCheck['kind'], string> = {
  identity: 'Identity verification',
  right_to_rent: 'Right to Rent check',
  bank_account: 'Bank account check',
  property_ownership: 'Property ownership check',
};

const stateCopy: Record<CredasCheck['state'], string> = {
  awaiting_participant: 'Invitation sent — waiting for them to start',
  in_progress: 'In progress',
  awaiting_title_selection: 'Choose a title to continue',
  pending: 'Waiting for the result',
  manual_review: 'Under manual review',
  completed: 'Complete',
  failed: 'Needs attention',
  expired: 'Invitation expired',
};

const componentCopy: Record<CredasComponentResult, string> = {
  pass: 'Passed', refer: 'Referred', fail: 'Not passed', action_required: 'Action required', not_performed: 'Not performed',
};

const matchCopy: Record<CredasMatch, string> = {
  match: 'Match', partial_match: 'Partial match', no_match: 'No match', not_checked: 'Not checked',
};

const inputClass = 'focus-ring w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60';
const primaryButton = 'focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-65';
const secondaryButton = 'focus-ring inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-60';

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[.7rem] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs font-semibold leading-5 text-destructive" role="alert" data-testid="text-credas-error">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
    </p>
  );
}

export function CredasCheckPanel({
  transaction,
  onTransactionRefresh,
}: {
  transaction: Transaction;
  onTransactionRefresh: () => Promise<boolean>;
}) {
  const reference = transaction.reference;
  const queryClient = useQueryClient();
  const queryKey = getGetCredasChecksQueryKey(reference);
  const checks = useGetCredasChecks(reference, { query: { queryKey, enabled: Boolean(reference), retry: false } });
  const refresh = useRefreshCredasChecks();
  const state = checks.data;

  const [openOwnJourney, setOpenOwnJourney] = useState(false);
  const apply = (next: CredasCheckState) => {
    queryClient.setQueryData<CredasCheckState>(queryKey, next);
    if (next.transactionStatus !== transaction.status) {
      void queryClient.invalidateQueries({ queryKey: getGetTransactionQueryKey(reference) });
      void onTransactionRefresh();
    }
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  // Payment confirmation changes what the server offers, so re-read when the status moves.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [transaction.status]);

  // While someone is still completing a journey, ask the server to re-check with the provider.
  const shouldPoll = Boolean(state?.actions.includes('refresh'));
  useEffect(() => {
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || refresh.isPending) return;
      refresh.mutate({ reference }, { onSuccess: (next) => applyRef.current(next) });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [shouldPoll, reference]);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" data-testid="panel-credas-check">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>
        <div>
          <p className="eyebrow text-primary">Your check</p>
          <h2 className="mt-2 font-display text-2xl">{transaction.product.name}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Enter the details below once payment is confirmed. Checks are run securely by our verification partner; results appear here.</p>
        </div>
      </div>

      {checks.isLoading ? <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground" role="status"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading your check…</p> : null}
      {checks.isError ? (
        <div className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm" role="alert">
          <p className="font-semibold text-destructive">{errorMessage(checks.error, 'We couldn’t load this check.')}</p>
          <button type="button" onClick={() => void checks.refetch()} className={`${secondaryButton} mt-3`}><RefreshCw className="h-3.5 w-3.5" /> Try again</button>
        </div>
      ) : null}

      {state ? (
        <div className="mt-6 space-y-5">
          {!state.paid ? <p className="rounded-xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm leading-6" data-testid="text-credas-payment-required">This check starts once your payment is confirmed.</p> : null}

          {state.outcome ? (
            <div className={`rounded-xl border px-4 py-3 ${outcomeCopy[state.outcome].tone}`} role="status" data-testid="text-credas-outcome">
              <p className="flex items-center gap-2 text-sm font-extrabold"><CheckCircle2 className="h-4 w-4" /> Result: {outcomeCopy[state.outcome].label}</p>
              <p className="mt-1 text-xs leading-5">{outcomeCopy[state.outcome].detail}</p>
            </div>
          ) : null}

          {state.checks.map((check) => <CheckCard key={check.id} check={check} reference={reference} onState={apply} onRefresh={() => { if (!refresh.isPending) refresh.mutate({ reference }, { onSuccess: (next) => applyRef.current(next) }); }} autoOpen={openOwnJourney} onAutoOpened={() => setOpenOwnJourney(false)} />)}

          {state.actions.includes('start') ? <StartForm state={state} transaction={transaction} onState={(next, self) => { apply(next); if (self) setOpenOwnJourney(true); }} /> : null}
          {state.actions.includes('bank-account') ? <BankAccountForm reference={reference} onState={apply} /> : null}
          {state.actions.includes('property') ? <PropertyForm reference={reference} onState={apply} /> : null}

          {state.actions.includes('refresh') ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-border/70 pt-4">
              <button type="button" disabled={refresh.isPending} onClick={() => refresh.mutate({ reference }, { onSuccess: apply })} className={secondaryButton} data-testid="button-credas-refresh">
                <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? 'animate-spin' : ''}`} /> Check for updates
              </button>
              <span className="text-xs text-muted-foreground">This page also checks automatically while it is open.</span>
              {refresh.isError ? <span className="text-xs font-semibold text-destructive">{errorMessage(refresh.error, 'We couldn’t check for updates just now.')}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mt-6 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">A check helps inform your decision. It is not a guarantee, and it is not legal or financial advice.</p>
    </section>
  );
}

function CheckCard({ check, reference, onState, onRefresh, autoOpen, onAutoOpened }: { check: CredasCheck; reference: string; onState: (next: CredasCheckState) => void; onRefresh: () => void; autoOpen: boolean; onAutoOpened: () => void }) {
  const resend = useResendCredasInvite();
  const journeyLink = useCreateCredasJourneyLink();
  const selectTitle = useSelectCredasPropertyTitle();
  const [downloading, setDownloading] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const complete = check.state === 'completed';

  // The journey link is the person's sign-in: it lives in memory only and is dropped on completion.
  const [journey, setJourney] = useState<{ url: string; expiresAt: number } | null>(null);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [journeyError, setJourneyError] = useState('');

  const openJourney = () => {
    setJourneyError('');
    if (journey && journey.expiresAt - Date.now() > 60_000) {
      setJourneyOpen(true);
      return;
    }
    journeyLink.mutate({ reference, checkId: check.id }, {
      onSuccess: ({ url, expiresAt }) => {
        if (!trustedJourneyUrl(url)) {
          setJourneyError('We couldn’t open your verification just now.');
          return;
        }
        setJourney({ url, expiresAt: new Date(expiresAt).getTime() });
        setJourneyOpen(true);
      },
    });
  };

  // Someone who has just chosen to verify themselves goes straight into their journey.
  useEffect(() => {
    if (!autoOpen || !check.canCompleteHere) return;
    onAutoOpened();
    openJourney();
  }, [autoOpen, check.canCompleteHere]);

  // Once the server reports the journey is no longer open to complete, close and forget the link.
  useEffect(() => {
    if (!check.canCompleteHere) {
      setJourneyOpen(false);
      setJourney(null);
    }
  }, [check.canCompleteHere]);

  const download = async (documentId: string, label: string) => {
    setDownloading(documentId);
    setDownloadError('');
    try {
      const blob = await downloadCredasDocument(reference, check.id, documentId, { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reference}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(errorMessage(error, 'That document could not be downloaded.'));
    } finally {
      setDownloading('');
    }
  };

  return (
    <div className="rounded-xl border border-border/80 bg-background/60 p-4 sm:p-5" data-testid={`card-credas-${check.kind}`}>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <p className="text-sm font-extrabold">{kindCopy[check.kind]}</p>
          {check.participantName ? <p className="mt-1 break-words text-xs text-muted-foreground">{check.participantName} · {check.participantEmail}</p> : null}
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[.69rem] font-bold ${complete && check.outcome ? outcomeCopy[check.outcome].tone : 'border-border bg-muted text-muted-foreground'}`} data-testid={`status-credas-${check.kind}`}>
          {complete ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
          {complete && check.outcome ? outcomeCopy[check.outcome].label : stateCopy[check.state]}
        </span>
      </div>

      {check.message ? <p className="mt-3 rounded-lg bg-destructive/5 px-3 py-2 text-xs font-semibold leading-5 text-destructive">{check.message}</p> : null}
      {check.state === 'manual_review' ? <p className="mt-3 text-xs leading-5 text-muted-foreground">This check needs a manual review. We’ll update this page when it is complete.</p> : null}

      {check.canCompleteHere || check.canResendInvite ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {check.canCompleteHere ? <button type="button" onClick={openJourney} disabled={journeyLink.isPending} className={primaryButton} data-testid="button-credas-complete-here">{journeyLink.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Complete your verification now</button> : null}
          {check.canResendInvite ? <button type="button" onClick={() => resend.mutate({ reference, checkId: check.id }, { onSuccess: onState })} disabled={resend.isPending} className={secondaryButton} data-testid="button-credas-resend"><Mail className="h-3.5 w-3.5" /> {resend.isPending ? 'Sending…' : resend.isSuccess ? 'Invitation sent' : 'Resend invitation'}</button> : null}
        </div>
      ) : null}
      {check.canCompleteHere ? <p className="mt-2 text-[.7rem] leading-5 text-muted-foreground">Opens here on this page. You’ll need your identity document and a device with a camera.</p> : null}
      {journeyLink.isError || journeyError ? <div className="mt-3"><FormError message={journeyError || errorMessage(journeyLink.error, 'We couldn’t open your verification just now.')} /></div> : null}
      {journey ? <CredasJourneyFrame url={journey.url} open={journeyOpen} onClose={() => { setJourneyOpen(false); onRefresh(); }} onProgress={onRefresh} /> : null}
      {resend.isError ? <div className="mt-3"><FormError message={errorMessage(resend.error, 'The invitation could not be sent.')} /></div> : null}

      {check.identity ? (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          <ResultLine label="Identity document" value={componentCopy[check.identity.document]} />
          <ResultLine label="Liveness" value={componentCopy[check.identity.liveness]} />
          <ResultLine label="Face match" value={componentCopy[check.identity.faceMatch]} />
          <ResultLine label="Name match" value={componentCopy[check.identity.nameMatch]} />
          {check.identity.documentType ? <ResultLine label="Document used" value={check.identity.documentType} /> : null}
        </dl>
      ) : null}

      {check.rightToRent ? (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          <ResultLine label="Right to Rent status" value={check.rightToRent.statusLabel} />
          <ResultLine label="Checking route" value={check.rightToRent.shareCodeUsed ? 'Home Office share code' : 'Identity document'} />
          {check.rightToRent.shareCode ? <ResultLine label="Share code" value={check.rightToRent.shareCode.valid ? 'Valid' : 'Not valid'} /> : null}
          {check.rightToRent.shareCode ? <ResultLine label="Share code face match" value={check.rightToRent.shareCode.faceMatch ? 'Match' : 'No match'} /> : null}
        </dl>
      ) : null}

      {check.bankAccount ? (
        <>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            <ResultLine label="Account holder" value={check.bankAccount.accountHolder} />
            <ResultLine label="Account" value={`${check.bankAccount.sortCode.replace(/(\d{2})(?=\d)/g, '$1-')} · ending ${check.bankAccount.accountNumberEnding}`} />
          </dl>
          <ul className="mt-3 space-y-1.5" data-testid="list-credas-bank-remarks">
            {check.bankAccount.remarks.map((remark, index) => (
              <li key={`${remark.type}-${index}`} className="flex items-start gap-2 text-xs leading-5">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${remark.type === 'match' ? 'bg-[#276952]' : remark.type === 'mismatch' ? 'bg-destructive' : remark.type === 'warning' ? 'bg-[#b8860b]' : 'bg-muted-foreground'}`} />
                <span>{remark.description}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {check.property ? (
        <>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            <ResultLine label="Name checked" value={check.property.ownerName} />
            <ResultLine label="Property" value={check.property.address} />
          </dl>
          {check.property.matches.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No registered title was matched for this address.</p> : null}
          <div className="mt-3 space-y-2">
            {check.property.matches.map((match, index) => (
              <div key={`${match.titleNumber ?? 'title'}-${index}`} className="rounded-lg bg-background/80 px-3 py-2.5 text-xs leading-5">
                <p className="font-bold">{match.titleNumber ? `Title ${match.titleNumber}` : 'Registered title'}{match.tenure ? ` · ${match.tenure}` : ''}{match.historical ? ' · historical' : ''}</p>
                <p className="text-muted-foreground">Owner name: <span className="font-semibold text-foreground">{matchCopy[match.overallMatch]}</span> (first name {matchCopy[match.firstNameMatch].toLowerCase()}, surname {matchCopy[match.surnameMatch].toLowerCase()}) · {match.ownership === 'joint' ? 'Joint ownership' : match.ownership === 'sole' ? 'Sole ownership' : 'Ownership type not stated'}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {check.titleOptions?.length ? (
        <div className="mt-4" data-testid="list-credas-title-options">
          <p className="text-xs font-bold">This address matches more than one registered title. Choose the one to check:</p>
          <div className="mt-2 space-y-2">
            {check.titleOptions.map((option) => (
              <button key={option.titleNumber} type="button" disabled={selectTitle.isPending} onClick={() => selectTitle.mutate({ reference, data: { titleNumber: option.titleNumber } }, { onSuccess: onState })} className="focus-ring block w-full rounded-xl border border-border p-3 text-left text-xs hover:border-primary/35 hover:bg-muted/40 disabled:cursor-wait disabled:opacity-60">
                <span className="font-extrabold">{option.titleNumber}</span>{option.tenure ? ` · ${option.tenure}` : ''}
                {option.address ? <span className="mt-1 block text-muted-foreground">{option.address}</span> : null}
              </button>
            ))}
          </div>
          {selectTitle.isError ? <div className="mt-3"><FormError message={errorMessage(selectTitle.error, 'That title could not be retrieved. Please try again.')} /></div> : null}
        </div>
      ) : null}

      {check.documents.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {check.documents.map((document) => (
            <button key={document.id} type="button" disabled={Boolean(downloading)} onClick={() => void download(document.id, document.label)} className={secondaryButton} data-testid={`button-credas-download-${document.id}`}>
              {downloading === document.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {document.label}
            </button>
          ))}
        </div>
      ) : null}
      {downloadError ? <div className="mt-3"><FormError message={downloadError} /></div> : null}
      {check.checkedAt ? <p className="mt-3 font-mono-safe text-[.68rem] text-muted-foreground">Checked {formatDateTime(check.checkedAt)}</p> : null}
    </div>
  );
}

function ResultLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-background/80 px-3 py-2.5">
      <dt className="text-[.68rem] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
    </div>
  );
}

function splitName(name: string): { firstName: string; surname: string } {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? { firstName: parts.slice(0, -1).join(' '), surname: parts.at(-1) ?? '' } : { firstName: '', surname: '' };
}

function StartForm({ state, transaction, onState }: { state: CredasCheckState; transaction: Transaction; onState: (next: CredasCheckState, self: boolean) => void }) {
  const start = useStartCredasVerification();
  const count = state.requiredChecks.filter((kind) => kind === 'identity' || kind === 'right_to_rent').length;
  const rightToRent = state.requiredChecks.includes('right_to_rent');
  // A single identity check can be for the buyer or for someone else; ask rather than assume.
  const canChoose = count === 1 && !rightToRent;
  const [who, setWho] = useState<'self' | 'other' | null>(canChoose ? null : 'other');
  const self = who === 'self';
  const [people, setPeople] = useState(() => Array.from({ length: count }, (_, index) => {
    const known = count > 1 ? transaction.participants[index] : undefined;
    return { ...splitName(known?.name ?? ''), email: known?.email ?? '' };
  }));
  const update = (index: number, field: 'firstName' | 'surname' | 'email', value: string) =>
    setPeople((current) => current.map((person, position) => position === index ? { ...person, [field]: value } : person));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (start.isPending || !who) return;
    const participants = self ? people.map((person) => ({ ...person, email: transaction.email })) : people;
    start.mutate({ reference: transaction.reference, data: { participants } }, { onSuccess: (next) => onState(next, self) });
  };
  const choice = (value: 'self' | 'other', title: string, detail: string) => (
    <button type="button" onClick={() => { setWho(value); start.reset(); }} aria-pressed={who === value} className={`focus-ring rounded-xl border p-4 text-left transition-colors ${who === value ? 'border-primary bg-primary/[.07] ring-1 ring-primary' : 'border-border bg-card hover:border-primary/35'}`} data-testid={`button-credas-who-${value}`}>
      <span className="block text-sm font-extrabold">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
    </button>
  );
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-primary/20 bg-primary/[.025] p-4 sm:p-5" data-testid="form-credas-start">
      <div>
        <p className="text-sm font-extrabold">{rightToRent ? 'Who is the prospective tenant?' : 'Who is being verified?'}</p>
        {canChoose ? null : <p className="mt-1 text-xs leading-5 text-muted-foreground">We’ll email {count > 1 ? 'each person' : 'them'} a secure invitation to complete {count > 1 ? 'their own' : 'the'} verification. Use the name shown on their identity document.</p>}
      </div>
      {canChoose ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {choice('self', 'Me', 'Verify your own identity now, here on this page. You’ll need your ID and a camera.')}
          {choice('other', 'Someone else', 'We email them a secure invitation to verify their own identity.')}
        </div>
      ) : null}
      {who ? people.map((person, index) => (
        <div key={index} className={`grid gap-3 ${self ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          <Field label={count > 1 ? `Person ${index + 1} first name` : 'First name'}><input required maxLength={100} autoComplete="off" value={person.firstName} onChange={(event) => update(index, 'firstName', event.target.value)} className={inputClass} data-testid={`input-credas-first-name-${index}`} /></Field>
          <Field label="Surname"><input required maxLength={100} autoComplete="off" value={person.surname} onChange={(event) => update(index, 'surname', event.target.value)} className={inputClass} data-testid={`input-credas-surname-${index}`} /></Field>
          {self ? null : <Field label="Email"><input required type="email" maxLength={254} autoComplete="off" value={person.email} onChange={(event) => update(index, 'email', event.target.value)} className={inputClass} data-testid={`input-credas-email-${index}`} /></Field>}
        </div>
      )) : null}
      {self ? <p className="text-xs leading-5 text-muted-foreground">Enter your name exactly as it appears on your identity document. Your verification is linked to {transaction.email}.</p> : null}
      {canChoose && who === 'other' ? <p className="text-xs leading-5 text-muted-foreground">Use the name shown on their identity document. They complete the verification themselves from the invitation.</p> : null}
      {start.isError ? <FormError message={errorMessage(start.error, self ? 'Your verification could not be started. Please try again.' : 'The invitation could not be sent. Please try again.')} /> : null}
      {who ? <button type="submit" disabled={start.isPending} className={primaryButton} data-testid="button-credas-start">{start.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : self ? <ShieldCheck className="h-4 w-4" /> : <Mail className="h-4 w-4" />} {start.isPending ? (self ? 'Starting…' : 'Sending…') : self ? 'Start my verification' : count > 1 ? 'Send invitations' : 'Send invitation'}</button> : null}
    </form>
  );
}

function BankAccountForm({ reference, onState }: { reference: string; onState: (next: CredasCheckState) => void }) {
  const run = useRunCredasBankAccountCheck();
  const [form, setForm] = useState({ firstName: '', surname: '', dateOfBirth: '', addressLine1: '', addressLine2: '', city: '', postcode: '', sortCode: '', accountNumber: '' });
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (run.isPending) return;
    const { dateOfBirth, addressLine2, ...required } = form;
    run.mutate({ reference, data: { ...required, ...(dateOfBirth ? { dateOfBirth } : {}), ...(addressLine2 ? { addressLine2 } : {}) } }, {
      onSuccess: (next) => {
        // Account details are never kept in the page once the check has run.
        setForm((current) => ({ ...current, sortCode: '', accountNumber: '' }));
        onState(next);
      },
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-primary/20 bg-primary/[.025] p-4 sm:p-5" autoComplete="off" data-testid="form-credas-bank">
      <div>
        <p className="text-sm font-extrabold">Bank account to check</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Enter the UK account you have been given and the account holder’s name and address. One check is included, so review the details before you run it.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Account holder’s first name"><input required maxLength={100} value={form.firstName} onChange={set('firstName')} className={inputClass} data-testid="input-credas-bank-first-name" /></Field>
        <Field label="Account holder’s surname"><input required maxLength={100} value={form.surname} onChange={set('surname')} className={inputClass} data-testid="input-credas-bank-surname" /></Field>
        <Field label="Address line 1"><input required maxLength={100} value={form.addressLine1} onChange={set('addressLine1')} className={inputClass} data-testid="input-credas-bank-address1" /></Field>
        <Field label="Address line 2 (optional)"><input maxLength={100} value={form.addressLine2} onChange={set('addressLine2')} className={inputClass} /></Field>
        <Field label="Town or city"><input required maxLength={100} value={form.city} onChange={set('city')} className={inputClass} data-testid="input-credas-bank-city" /></Field>
        <Field label="Postcode"><input required maxLength={8} value={form.postcode} onChange={set('postcode')} className={inputClass} data-testid="input-credas-bank-postcode" /></Field>
        <Field label="Sort code" hint="Six digits"><input required inputMode="numeric" maxLength={8} placeholder="00-00-00" value={form.sortCode} onChange={set('sortCode')} className={inputClass} data-testid="input-credas-bank-sort-code" /></Field>
        <Field label="Account number" hint="Eight digits"><input required inputMode="numeric" maxLength={8} value={form.accountNumber} onChange={set('accountNumber')} className={inputClass} data-testid="input-credas-bank-account-number" /></Field>
        <Field label="Date of birth (optional)"><input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className={inputClass} /></Field>
      </div>
      {run.isError ? <FormError message={errorMessage(run.error, 'The bank account check could not be completed. Please try again.')} /> : null}
      <button type="submit" disabled={run.isPending} className={primaryButton} data-testid="button-credas-run-bank">{run.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {run.isPending ? 'Checking account…' : 'Run bank account check'}</button>
    </form>
  );
}

function PropertyForm({ reference, onState }: { reference: string; onState: (next: CredasCheckState) => void }) {
  const run = useRunCredasPropertyCheck();
  const [form, setForm] = useState({ firstName: '', surname: '', addressLine1: '', addressLine2: '', city: '', postcode: '' });
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (run.isPending) return;
    const { addressLine2, ...required } = form;
    run.mutate({ reference, data: { ...required, ...(addressLine2 ? { addressLine2 } : {}) } }, { onSuccess: onState });
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-primary/20 bg-primary/[.025] p-4 sm:p-5" data-testid="form-credas-property">
      <div>
        <p className="text-sm font-extrabold">Property and owner to check</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Enter the property address and the name of the person who says they own it. We check that name against the registered owner.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Owner’s first name"><input required maxLength={100} value={form.firstName} onChange={set('firstName')} className={inputClass} data-testid="input-credas-property-first-name" /></Field>
        <Field label="Owner’s surname"><input required maxLength={100} value={form.surname} onChange={set('surname')} className={inputClass} data-testid="input-credas-property-surname" /></Field>
        <Field label="Address line 1"><input required maxLength={100} value={form.addressLine1} onChange={set('addressLine1')} className={inputClass} data-testid="input-credas-property-address1" /></Field>
        <Field label="Address line 2 (optional)"><input maxLength={100} value={form.addressLine2} onChange={set('addressLine2')} className={inputClass} /></Field>
        <Field label="Town or city"><input required maxLength={100} value={form.city} onChange={set('city')} className={inputClass} data-testid="input-credas-property-city" /></Field>
        <Field label="Postcode"><input required maxLength={8} value={form.postcode} onChange={set('postcode')} className={inputClass} data-testid="input-credas-property-postcode" /></Field>
      </div>
      {run.isError ? <FormError message={errorMessage(run.error, 'The property check could not be completed. Please try again.')} /> : null}
      <button type="submit" disabled={run.isPending} className={primaryButton} data-testid="button-credas-run-property">{run.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {run.isPending ? 'Checking ownership…' : 'Run property ownership check'}</button>
    </form>
  );
}
