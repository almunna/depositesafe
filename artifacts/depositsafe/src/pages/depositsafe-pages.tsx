import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { SignIn, SignUp } from '@clerk/react';
import { ArrowLeft, ArrowRight, Check, Clock3, FileCheck2, LockKeyhole, RefreshCw, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey,
  getGetProductQueryKey,
  getGetTransactionQueryKey,
  getListAdminTransactionsQueryKey,
  getListProductsQueryKey,
  getListTransactionsQueryKey,
  getReceiveClerkWebhookMutationKey,
  type Product,
  type Transaction,
  useGetDashboardSummary,
  useGetProduct,
  useGetTransaction,
  useListAdminTransactions,
  useListProducts,
  useListTransactions,
  useReceiveClerkWebhook,
} from '@workspace/api-client-react';
import {
  AppShell,
  BrandMark,
  EmptyState,
  ProductGrid,
  QueryError,
  ServiceCheck,
  SkeletonRows,
  StatusBadge,
  TransactionForm,
  TransactionRow,
  formatDate,
  formatDateTime,
} from '@/components/depositsafe';

export function HomePage() {
  const products = useListProducts({ query: { queryKey: getListProductsQueryKey(), staleTime: 60000 } });
  return (
    <div className="min-h-[100dvh] overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[700px] bg-[radial-gradient(circle_at_78%_8%,hsl(var(--accent)/.25),transparent_28%),linear-gradient(180deg,hsl(var(--muted)/.7),transparent_75%)]" />
      <PublicHomeHeader />
      <main>
        <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-12 lg:grid-cols-[1.04fr_.96fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-20">
          <div className="animate-rise">
            <p className="eyebrow flex items-center gap-2 text-primary"><span className="h-px w-7 bg-primary" /> Deposit verification, made clear</p>
            <h1 className="mt-6 max-w-2xl font-display text-[3.55rem] leading-[.94] tracking-[-.045em] text-balance sm:text-6xl lg:text-[5.6rem]">Paperwork you can <em className="text-primary">stand behind.</em></h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">DepositSafe gives important tenancy and identity checks a clear reference, a protected record, and a status you can trust.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#products" className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-extrabold text-primary-foreground hover:-translate-y-0.5" data-testid="link-browse-products">Browse Verify products <ArrowRight className="h-4 w-4" /></a>
              <Link href="/dashboard" className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3.5 text-sm font-extrabold hover:bg-muted" data-testid="link-track-transaction">Track a transaction</Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-muted-foreground"><span className="inline-flex items-center gap-2"><LockKeyhole className="h-3.5 w-3.5 text-primary" /> Secure reference tracking</span><span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" /> Built for UK tenancy checks</span></div>
          </div>
          <GuestEntryCard products={products.data ?? []} isLoading={products.isLoading} />
        </section>

        <section id="products" className="border-y border-border/75 bg-card/45">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div><p className="eyebrow text-primary">Verify V1 directory</p><h2 className="mt-3 font-display text-4xl tracking-[-.03em] sm:text-5xl">The right check for the record.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Seven focused products, each with a clear scope and one dependable reference to follow.</p></div>
              <span className="font-mono-safe text-xs text-muted-foreground">{products.data?.length ?? '—'} configured products</span>
            </div>
            <ProductGrid />
          </div>
        </section>

        <section id="how-it-works" className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[.78fr_1.22fr] lg:px-8 lg:py-28">
          <div><p className="eyebrow text-primary">A calm process</p><h2 className="mt-4 max-w-md font-display text-4xl leading-tight tracking-[-.03em] sm:text-5xl">Know what is happening, without chasing it.</h2><p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">DepositSafe separates the check itself from the noise around it. Start once, keep the reference, and return when you need the latest status.</p><div className="mt-7"><ServiceCheck /></div></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[['01', 'Choose a check', 'Select the Verify product that matches your paperwork.'], ['02', 'Name the record', 'Add an email and, where needed, the other participant.'], ['03', 'Follow the reference', 'See progress in one protected transaction view.']].map(([number, title, detail]) => <div key={number} className="rounded-2xl border border-border bg-card p-5"><span className="font-mono-safe text-xs text-primary">{number}</span><h3 className="mt-12 text-base font-extrabold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p></div>)}
          </div>
        </section>
      </main>
      <footer className="border-t border-border/75 px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><BrandMark /><span>Important records, given a dependable place to land.</span><span className="font-mono-safe">DEPOSITSAFE / VERIFY V1</span></div></footer>
    </div>
  );
}

function PublicHomeHeader() {
  return (
    <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
      <BrandMark />
      <nav className="hidden items-center gap-6 md:flex"><a href="#products" className="focus-ring text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="link-home-products">Products</a><a href="#how-it-works" className="focus-ring text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="link-home-process">How it works</a><Link href="/sign-in" className="focus-ring rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-bold" data-testid="link-home-sign-in">Sign in</Link></nav>
      <Link href="/sign-in" className="focus-ring rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold md:hidden" data-testid="link-mobile-sign-in">Sign in</Link>
    </header>
  );
}

function GuestEntryCard({ products, isLoading }: { products: Product[]; isLoading: boolean }) {
  return (
    <div className="relative animate-rise stagger-2">
      <div className="absolute -inset-4 rounded-[2rem] border border-primary/10 bg-primary/5" />
      <div className="relative overflow-hidden rounded-[1.6rem] border border-border bg-card p-6 shadow-[0_24px_70px_rgba(28,55,63,.11)] sm:p-8">
        <div className="flex items-start justify-between gap-6"><div><p className="eyebrow text-primary">Guest transaction</p><h2 className="mt-3 font-display text-3xl tracking-[-.03em]">Start from here.</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">No account required. We will give you a reference to return to.</p></div><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/30 text-foreground"><FileCheck2 className="h-5 w-5" /></div></div>
        {isLoading ? <div className="mt-7"><SkeletonRows count={2} /></div> : products.length ? <TransactionForm products={products} compact /> : <div className="mt-7 rounded-xl border border-border bg-muted/45 p-4 text-sm text-muted-foreground" data-testid="text-no-products">Product choices will appear here when Verify V1 is configured.</div>}
      </div>
    </div>
  );
}

export function ProductDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const product = useGetProduct(slug, { query: { queryKey: getGetProductQueryKey(slug), enabled: Boolean(slug), retry: false } });
  if (product.isLoading) return <PublicProductFrame><SkeletonRows count={3} /></PublicProductFrame>;
  if (product.isError || !product.data) return <PublicProductFrame><QueryError message="This Verify product could not be found." /></PublicProductFrame>;
  return <PublicProductFrame><div className="grid gap-12 lg:grid-cols-[1fr_400px] lg:items-start"><div><Link href="/" className="focus-ring inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground" data-testid="link-back-directory"><ArrowLeft className="h-3.5 w-3.5" /> Back to directory</Link><div className="mt-12 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-7 w-7" /></div><p className="eyebrow mt-8 text-primary">Verify V1 / {product.data.provider}</p><h1 className="mt-4 max-w-2xl font-display text-5xl tracking-[-.045em] sm:text-6xl">{product.data.name}</h1><p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">A focused verification check with a protected transaction record and a clear path to the result. The provider journey will be represented here when that integration is available.</p><div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-2"><InfoTile icon={<UsersRound />} title={product.data.participantMode === 'multiple' ? 'Multiple participants' : 'Single participant'} /><InfoTile icon={<LockKeyhole />} title="Protected reference" /></div><div className="mt-10 rounded-2xl border border-dashed border-border bg-muted/30 p-5"><p className="eyebrow text-muted-foreground">Structural placeholder</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Verification provider steps and payment processing are not part of this interface build. Your transaction will be created and tracked as a clear operational record.</p></div></div><div className="sticky top-6 rounded-2xl border border-border bg-card p-6 shadow-[0_18px_48px_rgba(28,55,63,.08)]"><div className="flex items-end justify-between border-b border-border/70 pb-5"><div><p className="eyebrow text-muted-foreground">Start check</p><p className="mt-2 text-sm font-bold">One protected reference</p></div><span className="font-display text-3xl">{product.data.price}</span></div><TransactionForm product={product.data} /></div></div></PublicProductFrame>;
}

function PublicProductFrame({ children }: { children: ReactNode }) {
  return <div className="min-h-[100dvh] overflow-hidden"><div className="absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(circle_at_75%_0%,hsl(var(--accent)/.22),transparent_36%)]" /><PublicHomeHeader /><main className="mx-auto max-w-7xl px-5 pb-20 pt-8 lg:px-8 lg:pt-14">{children}</main></div>;
}

function InfoTile({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 text-sm font-bold"><span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>{title}</div>;
}

export function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const isSignIn = mode === 'sign-in';
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return <div className="grid min-h-[100dvh] lg:grid-cols-[.86fr_1.14fr]"><div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex"><BrandMark inverse /><div><p className="eyebrow text-sidebar-primary">DepositSafe account</p><h1 className="mt-5 max-w-md font-display text-5xl leading-[.98] tracking-[-.04em]">The clear record of what matters.</h1><p className="mt-6 max-w-sm text-sm leading-6 text-sidebar-foreground/60">Sign in to follow your protected checks, or create an account to keep them together.</p></div><p className="font-mono-safe text-[.65rem] tracking-[.16em] text-sidebar-foreground/40">SECURE WORKSPACE / VERIFY V1</p></div><div className="flex items-center justify-center bg-background px-5 py-10"><div className="w-full max-w-[440px]"><div className="mb-8 lg:hidden"><BrandMark /></div><Link href="/" className="focus-ring mb-10 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground" data-testid="link-auth-home"><ArrowLeft className="h-3.5 w-3.5" /> Back to DepositSafe</Link><div className="rounded-2xl border border-border bg-card p-3 shadow-[0_18px_48px_rgba(28,55,63,.07)] sm:p-5">{isSignIn ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}</div><p className="mt-6 text-center text-[.68rem] leading-5 text-muted-foreground">Email and password access is provided by Clerk. DepositSafe never stores your password.</p></div></div></div>;
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
            <p className="mt-3 text-sm text-muted-foreground">A clear view of every deposit verification you have started.</p>
          </div>
          <Link href="/" className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground" data-testid="link-start-new-check">Start a new check <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {summary.isError ? (
          <div className="mt-8"><QueryError message="Your overview is not available yet." onRetry={() => void summary.refetch()} /></div>
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
                <EmptyState title="Your record starts here" detail="When you start a protected check, its reference and current status will appear in this list." action={<Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground" data-testid="link-empty-start-check">Start a check <ArrowRight className="h-3.5 w-3.5" /></Link>} />
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
  if (transaction.isLoading) return <AppShell active="transactions"><SkeletonRows count={3} /></AppShell>;
  if (transaction.isError || !transaction.data) return <AppShell active="transactions"><QueryError message="We could not find that transaction." onRetry={() => void transaction.refetch()} /></AppShell>;
  const item = transaction.data;
  const stageStatuses = ['STARTED', 'PAYMENT_PENDING', 'VERIFICATION_IN_PROGRESS', 'VERIFICATION_COMPLETED', 'DELIVERED'] as const;
  const currentIndex = Math.max(stageStatuses.indexOf(item.status as typeof stageStatuses[number]), 0);
  return <AppShell active="transactions" title="Transaction detail"><div className="animate-rise"><Link href="/dashboard" className="focus-ring inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground" data-testid="link-back-dashboard"><ArrowLeft className="h-3.5 w-3.5" /> Back to overview</Link><div className="mt-8 flex flex-col justify-between gap-6 border-b border-border/80 pb-8 md:flex-row md:items-end"><div><p className="eyebrow text-primary">Protected transaction</p><h1 className="mt-3 max-w-2xl font-display text-4xl tracking-[-.035em] sm:text-5xl">{item.product.name}</h1><p className="mt-3 font-mono-safe text-xs tracking-wide text-muted-foreground">{item.reference}</p></div><StatusBadge status={item.status} /></div><div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_.85fr]"><section className="rounded-2xl border border-border bg-card p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="eyebrow text-primary">Status path</p><h2 className="mt-2 font-display text-3xl">Where things stand</h2></div><Clock3 className="h-5 w-5 text-muted-foreground" /></div><div className="mt-8 space-y-0">{stageStatuses.map((status, index) => { const reached = index <= currentIndex; return <div key={status} className="flex gap-4"><div className="flex flex-col items-center"><span className={`z-10 grid h-8 w-8 place-items-center rounded-full border ${reached ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-muted-foreground'}`}>{reached ? <Check className="h-4 w-4" /> : <span className="font-mono-safe text-[.65rem]">{index + 1}</span>}</span>{index < stageStatuses.length - 1 ? <span className={`h-12 w-px ${index < currentIndex ? 'bg-primary' : 'bg-border'}`} /> : null}</div><div className="pb-8 pt-1"><p className={`text-sm font-bold ${reached ? 'text-foreground' : 'text-muted-foreground'}`}>{status === 'STARTED' ? 'Transaction started' : status === 'PAYMENT_PENDING' ? 'Payment pending' : status === 'VERIFICATION_IN_PROGRESS' ? 'Verification in progress' : status === 'VERIFICATION_COMPLETED' ? 'Verification completed' : 'Result delivered'}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{reached ? 'This stage has been recorded on your transaction.' : 'This stage will update when the previous step is complete.'}</p></div></div>; })}</div></section><aside className="space-y-4"><div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><p className="eyebrow text-muted-foreground">Record details</p><dl className="mt-5 space-y-4 text-sm"><DetailLine label="Created" value={formatDateTime(item.createdAt)} /><DetailLine label="Last updated" value={formatDateTime(item.updatedAt)} /><DetailLine label="Contact email" value={item.email} /><DetailLine label="Access" value={item.isGuest ? 'Guest reference' : 'Account workspace'} /></dl></div><div className="rounded-2xl border border-dashed border-border bg-muted/35 p-5"><p className="eyebrow text-muted-foreground">Participants</p>{item.participants.length ? <div className="mt-4 space-y-3">{item.participants.map((participant) => <div key={participant.id} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-accent/35 text-foreground"><UserRound className="h-3.5 w-3.5" /></span><div><p className="text-sm font-bold">{participant.name}</p><p className="text-xs text-muted-foreground">{participant.email}</p></div></div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">No additional participants recorded.</p>}</div></aside></div></div></AppShell>;
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