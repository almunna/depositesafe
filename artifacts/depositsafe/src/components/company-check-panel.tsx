import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Building2, ExternalLink, LoaderCircle, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import {
  getGetCompaniesHouseResultQueryKey,
  getGetTransactionQueryKey,
  getSearchCompaniesHouseCompaniesQueryKey,
  type CompanyCheckResult,
  type CompanySearchResult,
  type TransactionStatus,
  useGetCompaniesHouseResult,
  useRunCompaniesHouseCheck,
  useSearchCompaniesHouseCompanies,
} from '@workspace/api-client-react';

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() || 'Not available';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const finalizedStatuses: TransactionStatus[] = ['VERIFICATION_COMPLETED', 'RESULT_GENERATED', 'DELIVERED'];
const paidStatuses: TransactionStatus[] = [
  'PAID',
  'VERIFICATION_PENDING',
  'VERIFICATION_IN_PROGRESS',
  'VERIFICATION_COMPLETED',
  'RESULT_GENERATED',
  'DELIVERED',
  'VERIFICATION_FAILED',
];

export function CompanyCheckPanel({
  reference,
  status,
  onTransactionRefresh,
}: {
  reference: string;
  status: TransactionStatus;
  onTransactionRefresh: () => Promise<boolean>;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<CompanySearchResult | null>(null);
  const [searchValidation, setSearchValidation] = useState('');
  const result = useGetCompaniesHouseResult(reference, {
    query: { queryKey: getGetCompaniesHouseResultQueryKey(reference), enabled: Boolean(reference), retry: false },
  });
  const search = useSearchCompaniesHouseCompanies(
    { q: submittedQuery },
    { query: { queryKey: getSearchCompaniesHouseCompaniesQueryKey({ q: submittedQuery }), enabled: submittedQuery.length >= 2, retry: false } },
  );
  const runCheck = useRunCompaniesHouseCheck();
  const paid = paidStatuses.includes(status);
  const finalized = finalizedStatuses.includes(status);
  const savedResult = result.data;
  const waitingForFirstResult = result.isError && getErrorStatus(result.error) === 404;
  const resultRequestFailed = result.isError && !waitingForFirstResult;
  const canStartNewCheck = !savedResult && !finalized;
  const showSearchResults = submittedQuery === query.trim();

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (runCheck.isPending) return;
    const normalized = query.trim();
    setSelectedCompany(null);
    setSearchValidation('');
    if (normalized.length < 2) {
      setSearchValidation('Enter at least two characters to search.');
      return;
    }
    setSubmittedQuery(normalized);
    if (normalized === submittedQuery) void search.refetch();
  };

  const chooseCompany = (company: CompanySearchResult) => {
    if (runCheck.isPending) return;
    setSelectedCompany(company);
    runCheck.reset();
  };

  const startCheck = () => {
    if (!selectedCompany || !paid || !canStartNewCheck || runCheck.isPending) return;
    runCheck.mutate(
      { reference, data: { companyNumber: selectedCompany.companyNumber } },
      {
        onSuccess: (saved) => {
          queryClient.setQueryData<CompanyCheckResult>(getGetCompaniesHouseResultQueryKey(reference), saved);
          void queryClient.invalidateQueries({ queryKey: getGetCompaniesHouseResultQueryKey(reference) });
          void queryClient.invalidateQueries({ queryKey: getGetTransactionQueryKey(reference) });
          void onTransactionRefresh();
        },
      },
    );
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" data-testid="panel-company-check">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" />
        </span>
        <div>
          <p className="eyebrow text-primary">Companies House</p>
          <h2 className="mt-2 font-display text-2xl">Company Check</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Search the public UK company register, select the exact company, and view the saved register details for this transaction. Search can return partial matches, so confirm the exact registered name and company number before selecting.
          </p>
        </div>
      </div>

      {savedResult ? (
        <SavedCompanyResult result={savedResult} />
      ) : (
        <>
          {result.isLoading ? (
            <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Checking for a saved Companies House result…
            </p>
          ) : null}

          {resultRequestFailed || (finalized && !savedResult) ? (
            <div className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm" role="alert" data-testid="text-company-result-error">
              <p className="font-semibold text-destructive">
                {finalized
                  ? 'This completed transaction’s saved company result could not be loaded.'
                  : errorMessage(result.error, 'The saved company result could not be loaded.')}
              </p>
              <button
                type="button"
                onClick={() => void result.refetch()}
                className="focus-ring mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted"
                data-testid="button-retry-company-result"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry loading result
              </button>
            </div>
          ) : null}

          {waitingForFirstResult && !finalized ? (
            <p className="mt-5 rounded-xl bg-muted/60 px-4 py-3 text-sm leading-6 text-muted-foreground" role="status" data-testid="text-company-no-result">
              No Companies House result has been saved yet. Search for a company below to begin.
            </p>
          ) : null}

          {finalized && !savedResult ? (
            <p className="mt-5 rounded-xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm leading-6" role="status" data-testid="text-company-result-pending">
              This transaction is marked complete, but its saved company result is not currently available. Retry loading the result above; a different company cannot be checked for this completed transaction.
            </p>
          ) : null}

          {!paid ? (
            <p className="mt-5 rounded-xl border border-accent/40 bg-accent/15 px-4 py-3 text-sm leading-6" data-testid="text-company-payment-required">
              Complete the existing Stripe checkout first. You can search the public register now, but a Company Check cannot run until payment is confirmed.
            </p>
          ) : null}

          {canStartNewCheck ? (
            <>
              <form onSubmit={submitSearch} className="mt-6">
                <label htmlFor="company-search" className="mb-2 block text-sm font-bold">Company name or UK company number</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="company-search"
                    value={query}
                    maxLength={120}
                    onChange={(event) => {
                      if (runCheck.isPending) return;
                      setQuery(event.target.value);
                      setSelectedCompany(null);
                      setSearchValidation('');
                      runCheck.reset();
                    }}
                    disabled={runCheck.isPending}
                    placeholder="e.g. Acme Limited or 01234567"
                    className="focus-ring min-h-11 flex-1 rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm"
                    autoComplete="organization"
                    data-testid="input-company-search"
                  />
                  <button
                    type="submit"
                    disabled={search.isFetching || runCheck.isPending}
                    className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-65"
                    data-testid="button-search-companies"
                  >
                    {search.isFetching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {search.isFetching ? 'Searching…' : 'Search'}
                  </button>
                </div>
                {searchValidation ? <p className="mt-2 text-xs font-semibold text-destructive" role="alert">{searchValidation}</p> : null}
              </form>

              {showSearchResults && search.isLoading ? (
                <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-muted-foreground" role="status">
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Searching Companies House…
                </p>
              ) : null}
              {showSearchResults && search.isError ? (
                <div className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm" role="alert" data-testid="text-company-search-error">
                  <p className="font-semibold text-destructive">{errorMessage(search.error, 'Companies House search failed. Please try again.')}</p>
                  <button
                    type="button"
                    onClick={() => void search.refetch()}
                    disabled={search.isFetching}
                    className="focus-ring mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-60"
                    data-testid="button-retry-company-search"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Retry search
                  </button>
                </div>
              ) : null}
              {showSearchResults && search.isSuccess && search.data.items.length === 0 ? (
                <p className="mt-5 rounded-xl bg-muted/60 px-4 py-3 text-sm leading-6 text-muted-foreground" role="status" data-testid="text-company-no-matches">
                  No matching companies were found. Check the spelling or number and try another search.
                </p>
              ) : null}

              {showSearchResults && search.data?.items.length ? (
                <div className="mt-5 space-y-3" aria-label="Companies House search results" data-testid="list-company-search-results">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {search.data.totalResults ?? search.data.items.length} result{(search.data.totalResults ?? search.data.items.length) === 1 ? '' : 's'} — select the exact company to continue.
                  </p>
                  {search.data.truncated ? (
                    <p className="rounded-lg bg-accent/15 px-3 py-2 text-xs leading-5 text-foreground" role="status" data-testid="text-company-search-truncated">
                      There are more matching companies than shown. Narrow your search with a more specific company name or number before selecting.
                    </p>
                  ) : null}
                  {search.data.items.map((company) => {
                    const selected = selectedCompany?.companyNumber === company.companyNumber;
                    return (
                      <button
                        type="button"
                        key={company.companyNumber}
                        onClick={() => chooseCompany(company)}
                        disabled={runCheck.isPending}
                        aria-pressed={selected}
                        className={`focus-ring block w-full rounded-xl border p-4 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${selected ? 'border-primary bg-primary/[.045]' : 'border-border hover:border-primary/35 hover:bg-muted/40'}`}
                        data-testid={`button-select-company-${company.companyNumber}`}
                      >
                        <span className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                          <span className="font-extrabold">{company.name}</span>
                          <span className="rounded-md bg-muted px-2 py-1 font-mono-safe text-xs font-bold">{company.companyNumber}</span>
                        </span>
                        <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                          Status: <span className="font-semibold text-foreground">{company.status}</span>
                          {company.addressSnippet ? <> · {company.addressSnippet}</> : null}
                        </span>
                        {company.dateOfCreation ? <span className="mt-1 block text-xs text-muted-foreground">Created {formatDate(company.dateOfCreation)}</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {selectedCompany ? (
                <div className="mt-5 rounded-xl border border-primary/20 bg-primary/[.035] p-4" data-testid="panel-selected-company">
                  <p className="eyebrow text-primary">Selected company</p>
                  <p className="mt-2 text-sm font-extrabold">{selectedCompany.name}</p>
                  <p className="mt-1 font-mono-safe text-xs text-muted-foreground">{selectedCompany.companyNumber} · {selectedCompany.status}</p>
                  {!paid ? (
                    <p className="mt-3 text-xs font-semibold leading-5 text-muted-foreground">Complete the existing Stripe checkout first to enable the paid Company Check.</p>
                  ) : (
                    <button
                      type="button"
                      onClick={startCheck}
                      disabled={runCheck.isPending}
                      className="focus-ring mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground disabled:cursor-wait disabled:opacity-65"
                      data-testid="button-run-company-check"
                    >
                      {runCheck.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {runCheck.isPending ? 'Checking company…' : 'Run Company Check'}
                    </button>
                  )}
                </div>
              ) : null}
              {runCheck.isError ? (
                <p className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs font-semibold leading-5 text-destructive" role="alert" data-testid="text-company-check-error">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {errorMessage(runCheck.error, 'The Company Check could not be completed. Please try again.')}
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}

      <p className="mt-6 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
        Companies House information is drawn from the public register. A register match is not a guarantee of identity, accuracy, legitimacy or creditworthiness.
      </p>
    </section>
  );
}

function SavedCompanyResult({ result }: { result: CompanyCheckResult }) {
  return (
    <div className="mt-6 rounded-xl border border-primary/20 bg-primary/[.025] p-4 sm:p-5" data-testid="panel-company-result">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="eyebrow text-primary">Saved Companies House result</p>
          <h3 className="mt-2 text-lg font-extrabold">{result.companyName}</h3>
          <p className="mt-1 font-mono-safe text-xs text-muted-foreground">{result.companyNumber}</p>
        </div>
      </div>

      <p className="mt-4 rounded-lg bg-background/80 px-3 py-2.5 text-sm font-semibold" data-testid="text-company-result-outcome">{result.outcome}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <ResultLine label="Company status" value={result.companyStatus} />
        <ResultLine label="Company type" value={result.companyType} />
        <ResultLine label="Date of creation" value={formatDate(result.dateOfCreation)} />
        <ResultLine label="Date of cessation" value={formatDate(result.dateOfCessation)} />
        <ResultLine label="Registered office address" value={result.registeredOfficeAddress} />
        <ResultLine label="SIC codes" value={result.sicCodes?.length ? result.sicCodes.join(', ') : null} />
        <ResultLine label="Next accounts due" value={formatDate(result.nextAccountsDue)} />
        <ResultLine label="Next confirmation statement due" value={formatDate(result.nextConfirmationStatementDue)} />
        <ResultLine label="Checked at" value={formatDateTime(result.checkedAt)} />
      </dl>
      {result.sourceUrl ? (
        <a
          href={result.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="focus-ring mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
          data-testid="link-company-register-source"
        >
          View company on Companies House <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        This saved result is linked to the selected company and transaction. It does not guarantee identity, accuracy, legitimacy or creditworthiness.
      </p>
    </div>
  );
}

function ResultLine({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 rounded-lg bg-background/80 px-3 py-2.5">
      <dt className="text-[.68rem] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold">{displayValue(value)}</dd>
    </div>
  );
}