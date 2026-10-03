import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { SignIn, SignUp } from '@clerk/react';
import { ArrowLeft, ArrowRight, Check, Clock3, FileCheck2, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey,
  getGetProductQueryKey,
  getGetTransactionQueryKey,
  getListAdminTransactionsQueryKey,
  getListTransactionsQueryKey,
  getReceiveClerkWebhookMutationKey,
  type Transaction,
  useGetDashboardSummary,
  useGetProduct,
  useGetTransaction,
  useListAdminTransactions,
  useListTransactions,
  useReceiveClerkWebhook,
} from '@workspace/api-client-react';
import {
  AppShell,
  BrandMark,
  EmptyState,
  QueryError,
  SkeletonRows,
  StatusBadge,
  TransactionForm,
  TransactionRow,
  formatDate,
  formatDateTime,
} from '@/components/depositsafe';
import { PaymentPanel, type PaymentReturnState } from '@/components/payment-panel';
import { CompanyCheckPanel } from '@/components/company-check-panel';
import { CompanyCheckProgress } from '@/components/company-check-progress';
import { PublicLayout, usePageMeta } from '@/components/public/public-layout';
import { getProductCopy } from '@/lib/product-copy';
import { VerifyProductPage } from './verify-product-page';

export { HomePage } from './home-page';

export function ProductDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const product = useGetProduct(slug, { query: { queryKey: getGetProductQueryKey(slug), enabled: Boolean(slug), retry: false } });
  const copy = getProductCopy(slug);
  const isCompanyCheck = slug === 'company-check';
  usePageMeta(
    slug === 'verify' ? 'Verify | DepositSafe' : `${product.data?.name ?? 'Verification checks'} | DepositSafe`,
    slug === 'verify'
      ? "Whether you're paying a deposit, buying from someone privately or dealing with someone you've met online, Verify gives you a simple way to check their identity before you proceed."
      : copy?.summary ?? 'Explore DepositSafe checks before you commit or send money.',
  );
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [slug]);
  if (slug === 'verify') {
    return (
      <PublicLayout>
        <VerifyProductPage
          checkout={
            product.isLoading ? <SkeletonRows count={2} /> : product.isError || !product.data ? (
              <QueryError message="We could not load the Verify start form." onRetry={() => void product.refetch()} />
            ) : <TransactionForm product={product.data} />
          }
        />
      </PublicLayout>
    );
  }
  if (product.isLoading) return <PublicProductFrame companyCheck={isCompanyCheck}><SkeletonRows count={3} /></PublicProductFrame>;
  if (product.isError || !product.data) return <PublicProductFrame companyCheck={isCompanyCheck}><QueryError message="This DepositSafe check could not be found." onRetry={() => void product.refetch()} /><Link href="/" className="focus-ring mt-5 inline-flex items-center gap-2 font-bold text-primary"><ArrowLeft className="h-4 w-4" /> Browse DepositSafe checks</Link></PublicProductFrame>;
  return (
    <PublicProductFrame companyCheck={isCompanyCheck}>
      <div className="grid gap-12 lg:grid-cols-[1fr_400px] lg:items-start">
        <div>
          <Link href="/" className="focus-ring inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground" data-testid="link-back-directory"><ArrowLeft className="h-4 w-4" /> Back to our checks</Link>
          <div className="mt-10 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-7 w-7" /></div>
          <p className="mt-6 text-sm font-bold text-primary">{product.data.name} by DepositSafe</p>
          <h1 className="ds-display mt-4 text-4xl font-extrabold sm:text-5xl">{product.data.name}</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">{copy?.summary ?? `Find out about ${product.data.name} before starting.`}</p>
          {copy?.audience ? <p className="mt-4 font-bold text-primary">{copy.audience}</p> : null}
          {copy ? <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
            {copy.features.map((feature) => <InfoTile key={feature} icon={<Check />} title={feature} />)}
          </div> : null}
          <div className="mt-8 rounded-2xl bg-secondary p-5">
            <h2 className="text-sm font-bold">Before you start</h2>
            {copy ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.beforeStart}</p> : null}
             {isCompanyCheck ? <p className="mt-3 text-sm leading-6 text-muted-foreground">Companies House information does not itself guarantee identity, legitimacy or creditworthiness.</p> : <><p className="mt-3 text-sm leading-6 text-muted-foreground">DepositSafe is pre-launch and check availability may vary. Starting a record does not mean a payment has been taken or that the check is complete. Ask <Link href="/help" className="font-bold text-primary underline">our support team</Link> about availability before starting.</p><p className="mt-3 text-sm leading-6 text-muted-foreground">Checks help inform your decision; they do not guarantee a person, payment or transaction is safe.</p></>}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-white p-6 shadow-lg lg:sticky lg:top-24">
          <div className="flex items-end justify-between border-b border-border pb-5">
            <div><p className="text-sm font-bold text-muted-foreground">Start {product.data.name}</p><p className="mt-2 text-sm font-bold">Price per check</p></div>
            <span className="ds-display text-3xl font-bold text-primary">{product.data.price}</span>
          </div>
          <TransactionForm product={product.data} />
        </div>
      </div>
    </PublicProductFrame>
  );
}

function PublicProductFrame({ children, companyCheck = false }: { children: ReactNode; companyCheck?: boolean }) {
  return <PublicLayout companyCheck={companyCheck}><div className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-20">{children}</div></PublicLayout>;
}

function InfoTile({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 text-sm font-bold"><span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>{title}</div>;
}

export function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const isSignIn = mode === 'sign-in';
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const appearance = {
    options: { logoImageUrl: `${window.location.origin}${basePath}/approved-depositsafe-logo.png` },
    elements: {
      logoImage: { height: '44px', width: 'auto', maxWidth: '190px' },
      formButtonPrimary: { color: '#ffffff' },
    },
    variables: {
      colorPrimary: '#0065D5', colorForeground: '#002553', colorMutedForeground: '#4e5e74',
      colorBackground: '#ffffff', colorInput: '#f3f8fb', colorInputForeground: '#002553',
      fontFamily: 'Inter, Manrope, sans-serif',
    },
  };
  return <div className="ds-customer grid min-h-[100dvh] lg:grid-cols-[.86fr_1.14fr]"><div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex"><BrandMark inverse /><div><p className="eyebrow text-sidebar-foreground/80">DepositSafe account</p><h1 className="mt-5 max-w-md font-display text-5xl leading-[1.1] tracking-[-.04em]">Your DepositSafe checks, together.</h1><p className="mt-6 max-w-sm text-sm leading-6 text-sidebar-foreground/80">Sign in to follow your checks, or create an account to keep your check records together.</p></div><p className="text-sm text-sidebar-foreground/80">Verify with confidence.</p></div><div className="flex items-center justify-center bg-background px-5 py-10"><div className="w-full max-w-[440px]"><div className="mb-8 lg:hidden"><BrandMark /></div><Link href="/" className="focus-ring mb-10 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground" data-testid="link-auth-home"><ArrowLeft className="h-3.5 w-3.5" /> Back to DepositSafe</Link><div className="rounded-2xl border border-border bg-card p-3 shadow-[0_18px_48px_rgba(0,37,83,.07)] sm:p-5">{isSignIn ? <SignIn appearance={appearance} routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> : <SignUp appearance={appearance} routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}</div><p className="mt-6 text-center text-[.68rem] leading-5 text-muted-foreground">DepositSafe never stores your password.</p></div></div></div>;
}

export function DashboardPage() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey(), retry: false } });
  const transactions = useListTransactions({ query: { queryKey: getListTransactionsQueryKey(), retry: false } });
  if (summary.isLoading || transactions.isLoading) return <AppShell active="dashboard"><SkeletonRows count={4} /></AppShell>;
  const summaryData = summary.data;
  return (
    <AppShell active="dashboard" title="Customer overview">
      <div className="animate-rise">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow text-primary">Your workspace</p>
            <h1 className="mt-3 font-display text-5xl tracking-[-.04em]">Good to see you.</h1>
            <p className="mt-3 text-sm text-muted-foreground">A clear view of the DepositSafe checks you have started.</p>
          </div>
          <Link href="/" className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground" data-testid="link-start-new-check">Start a new check <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {summary.isError ? (
           <div className="mt-8"><QueryError message="We could not load your check overview." onRetry={() => void summary.refetch()} /><p className="mt-4 text-center text-sm text-muted-foreground">If you are not signed in, <Link href="/sign-in" className="font-bold text-primary underline">sign in to view your account checks</Link>. For a guest check, return to its original browser tab.</p></div>
        ) : summaryData ? (
          <>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                ['Total checks', summaryData.totalTransactions, 'All records'],
                ['In progress', summaryData.activeTransactions, 'Need your attention'],
                ['Completed', summaryData.completedTransactions, 'Ready or delivered'],
              ].map(([label, value, detail], index) => (
                <div key={String(label)} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <span className="eyebrow text-muted-foreground">{label}</span>
                    <span className={`grid h-8 w-8 place-items-center rounded-lg ${index === 1 ? 'bg-accent/30' : 'bg-primary/10'} text-primary`}><FileCheck2 className="h-4 w-4" /></span>
                  </div>
                  <p className="mt-7 font-display text-4xl">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
            <section id="transactions" className="mt-12">
              <div className="mb-5 flex items-center justify-between">
                <div><p className="eyebrow text-primary">Activity</p><h2 className="mt-2 font-display text-3xl">Recent transactions</h2></div>
                <span className="font-mono-safe text-xs text-muted-foreground">{transactions.data?.length ?? 0} records</span>
              </div>
              {transactions.isError ? (
                <QueryError message="Transactions are temporarily unavailable." onRetry={() => void transactions.refetch()} />
              ) : transactions.data?.length ? (
                <div className="space-y-3">{transactions.data.slice(0, 8).map((transaction) => <TransactionRow key={transaction.reference} transaction={transaction} />)}</div>
              ) : (
                <EmptyState title="Your record starts here" detail="When you start a DepositSafe check using your account, its reference and current status will appear in this list." action={<Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground" data-testid="link-empty-start-check">Choose a check <ArrowRight className="h-3.5 w-3.5" /></Link>} />
              )}
            </section>
          </>
        ) : (
          <EmptyState title="No overview yet" detail="Your customer workspace will appear here once your first transaction is created." />
        )}
      </div>
    </AppShell>
  );
}

export function TransactionDetailPage() {
  const { reference = '' } = useParams<{ reference: string }>();
  const transaction = useGetTransaction(reference, { query: { queryKey: getGetTransactionQueryKey(reference), enabled: Boolean(reference), retry: false } });
  const refreshTransaction = useCallback(async () => {
    const result = await transaction.refetch();
    return !result.isError;
  }, [transaction.refetch]);
  const paymentValue = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('payment');
  const returnState: PaymentReturnState = paymentValue === 'success' || paymentValue === 'cancel' || paymentValue === 'checkout-error' ? paymentValue : null;
  if (transaction.isLoading) return <AppShell active="transactions"><SkeletonRows count={3} /></AppShell>;
  if (transaction.isError || !transaction.data) return <AppShell active="transactions"><QueryError message="We could not load this check record." onRetry={() => void transaction.refetch()} /><p className="mt-4 text-sm text-muted-foreground">For an account check, <Link href="/sign-in" className="font-bold text-primary underline">sign in</Link>. For a guest check, use its original browser tab; the reference alone does not restore access. If you need help, <Link href="/help" className="font-bold text-primary underline">contact support</Link> and include your reference.</p></AppShell>;
  const item = transaction.data;
  const isCompanyCheck = item.product.slug === 'company-check';
  const stageStatuses: readonly string[] = ['STARTED', 'PAYMENT_PENDING', 'PAID', 'VERIFICATION_IN_PROGRESS', 'VERIFICATION_COMPLETED', 'DELIVERED'];
  const currentIndex = Math.max(stageStatuses.indexOf(item.status), 0);
  const stageTitle = (status: string) => {
    return status === 'STARTED' ? 'Transaction started' : status === 'PAYMENT_PENDING' ? 'Payment pending' : status === 'PAID' ? 'Payment confirmed' : status === 'VERIFICATION_IN_PROGRESS' ? 'Verification in progress' : status === 'VERIFICATION_COMPLETED' ? 'Verification completed' : 'Result delivered';
  };
  return (
    <AppShell active="transactions" title={isCompanyCheck ? 'Your Company Check' : 'Transaction detail'} companyCheck={isCompanyCheck}>
      <div className="animate-rise">
        <Link href="/dashboard" className="focus-ring inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground" data-testid="link-back-dashboard"><ArrowLeft className="h-3.5 w-3.5" /> Back to overview</Link>
        <div className="mt-8 flex flex-col justify-between gap-6 border-b border-border/80 pb-8 md:flex-row md:items-end">
           <div><p className="eyebrow text-primary">Your {item.product.name} record</p><h1 className="mt-3 max-w-2xl font-display text-4xl tracking-[-.035em] sm:text-5xl">{item.product.name}</h1><p className="mt-3 font-mono-safe text-xs tracking-wide text-muted-foreground">{item.reference}</p></div>
          {isCompanyCheck ? <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary">{['VERIFICATION_COMPLETED', 'RESULT_GENERATED', 'DELIVERED'].includes(item.status) ? 'Result ready' : ['VERIFICATION_FAILED', 'MANUAL_ATTENTION', 'PAYMENT_FAILED', 'EXPIRED'].includes(item.status) ? 'Needs attention' : item.status === 'PAID' ? 'Ready to check a company' : item.status === 'VERIFICATION_IN_PROGRESS' ? 'Checking company details' : item.status === 'VERIFICATION_PENDING' ? 'Check queued' : 'Awaiting payment'}</span> : <StatusBadge status={item.status} />}
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_.85fr]">
          {isCompanyCheck ? <CompanyCheckProgress status={item.status} /> : <section className="rounded-2xl border border-border bg-card p-5 sm:p-7">
            <div className="flex items-center justify-between"><div><p className="eyebrow text-primary">Status path</p><h2 className="mt-2 font-display text-3xl">Where things stand</h2></div><Clock3 className="h-5 w-5 text-muted-foreground" /></div>
            <div className="mt-8 space-y-0">
              {stageStatuses.map((status, index) => {
                const reached = index <= currentIndex;
                return (
                  <div key={status} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className={`z-10 grid h-8 w-8 place-items-center rounded-full border ${reached ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-muted-foreground'}`}>{reached ? <Check className="h-4 w-4" /> : <span className="font-mono-safe text-[.65rem]">{index + 1}</span>}</span>
                      {index < stageStatuses.length - 1 ? <span className={`h-12 w-px ${index < currentIndex ? 'bg-primary' : 'bg-border'}`} /> : null}
                    </div>
                    <div className="pb-8 pt-1">
                      <p className={`text-sm font-bold ${reached ? 'text-foreground' : 'text-muted-foreground'}`}>{stageTitle(status)}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {reached
                           ? 'This stage has been recorded on your transaction.'
                          : 'This stage will update when the previous step is complete.'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>}
          <aside className="space-y-4">
            <PaymentPanel transaction={item} returnState={returnState} onRefresh={refreshTransaction} />
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><p className="eyebrow text-muted-foreground">Record details</p><dl className="mt-5 space-y-4 text-sm"><DetailLine label="Created" value={formatDateTime(item.createdAt)} /><DetailLine label="Last updated" value={formatDateTime(item.updatedAt)} /><DetailLine label="Contact email" value={item.email} /><DetailLine label="Access" value={item.isGuest ? 'Guest reference' : 'Account workspace'} /></dl></div>
            {!isCompanyCheck ? <div className="rounded-2xl border border-dashed border-border bg-muted/35 p-5"><p className="eyebrow text-muted-foreground">Participants</p>{item.participants.length ? <div className="mt-4 space-y-3">{item.participants.map((participant) => <div key={participant.id} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-accent/35 text-foreground"><UserRound className="h-3.5 w-3.5" /></span><div><p className="text-sm font-bold">{participant.name}</p><p className="text-xs text-muted-foreground">{participant.email}</p></div></div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">No additional participants recorded.</p>}</div> : null}
          </aside>
        </div>
        {isCompanyCheck ? <div className="mt-8"><CompanyCheckPanel reference={item.reference} status={item.status} onTransactionRefresh={refreshTransaction} /></div> : null}
      </div>
    </AppShell>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-3 last:border-0 last:pb-0"><dt className="text-muted-foreground">{label}</dt><dd className="max-w-[60%] text-right font-semibold">{value}</dd></div>;
}

export function AdminPage() {
  const adminTransactions = useListAdminTransactions({ query: { queryKey: getListAdminTransactionsQueryKey(), retry: false } });
  const webhook = useReceiveClerkWebhook({ mutation: { mutationKey: getReceiveClerkWebhookMutationKey() } });
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const list = useMemo(() => (adminTransactions.data ?? []).filter((item) => filter === 'all' || item.status === filter), [adminTransactions.data, filter]);
  const sync = () => webhook.mutate({ data: {} }, { onSuccess: () => setNotice('Clerk sync request accepted.'), onError: () => setNotice('The sync endpoint is not available right now.') });
  return <AppShell active="admin" title="Admin oversight"><div className="animate-rise"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow text-primary">Operations</p><h1 className="mt-3 font-display text-5xl tracking-[-.04em]">Transaction oversight.</h1><p className="mt-3 text-sm text-muted-foreground">A read-only view of every DepositSafe record and its current state.</p></div><button type="button" onClick={sync} disabled={webhook.isPending} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm font-extrabold text-primary disabled:opacity-60" data-testid="button-sync-clerk">{webhook.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync user directory</button></div>{notice ? <p className="mt-5 rounded-lg bg-primary/8 px-3 py-2 text-xs font-semibold text-primary" data-testid="text-admin-notice">{notice}</p> : null}{adminTransactions.isLoading ? <div className="mt-10"><SkeletonRows count={6} /></div> : adminTransactions.isError ? <div className="mt-10"><QueryError message="Admin transactions are unavailable for this account." onRetry={() => void adminTransactions.refetch()} /></div> : <section className="mt-10 rounded-2xl border border-border bg-card p-4 sm:p-6"><div className="flex flex-col justify-between gap-4 border-b border-border/70 pb-5 md:flex-row md:items-center"><div><p className="eyebrow text-muted-foreground">All records</p><p className="mt-2 text-sm font-bold">{list.length} visible transactions</p></div><select value={filter} onChange={(event) => setFilter(event.target.value)} className="focus-ring rounded-lg border border-input bg-background px-3 py-2 text-xs font-bold" data-testid="select-admin-filter"><option value="all">All statuses</option>{['STARTED', 'PAYMENT_PENDING', 'VERIFICATION_IN_PROGRESS', 'VERIFICATION_COMPLETED', 'DELIVERED', 'MANUAL_ATTENTION'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></div>{list.length ? <div className="mt-4 space-y-2">{list.map((transaction) => <AdminRow key={transaction.reference} transaction={transaction} />)}</div> : <div className="pt-4"><EmptyState title="No matching transactions" detail="Try another status filter or wait for the next transaction to enter the system." /></div>}</section>}</div></AppShell>;
}

function AdminRow({ transaction }: { transaction: Transaction }) {
  return <Link href={`/transactions/${transaction.reference}`} className="group grid gap-3 rounded-xl border border-border/70 px-4 py-4 transition-colors hover:border-primary/35 hover:bg-primary/[.025] md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center" data-testid={`row-admin-transaction-${transaction.reference}`}><div><p className="text-sm font-extrabold">{transaction.product.name}</p><p className="mt-1 font-mono-safe text-[.65rem] tracking-wide text-muted-foreground">{transaction.reference}</p></div><div className="text-xs"><p className="font-bold">{transaction.email}</p><p className="mt-1 text-muted-foreground">{transaction.isGuest ? 'Guest record' : 'Account record'}</p></div><div className="text-xs text-muted-foreground">Updated {formatDate(transaction.updatedAt)}</div><StatusBadge status={transaction.status} /></Link>;
}