import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, Check, ChevronDown, CircleAlert, Clock3, FileCheck2, LoaderCircle, Menu, RefreshCw, ShieldCheck, X } from 'lucide-react';
import {
  healthCheck as getHealthCheck,
  getHealthCheckQueryKey,
  getGetCurrentUserQueryKey,
  getListProductsQueryKey,
  type Product,
  type Transaction,
  type TransactionStatus,
  useCreateTransaction,
  useCreateStripeCheckoutSession,
  useGetCurrentUser,
  useHealthCheck,
  useListProducts,
} from '@workspace/api-client-react';
import {
  checkoutErrorStorageKey,
  checkoutIdempotencyKey,
  getCheckoutReturnUrl,
  secureCheckoutUrl,
} from '@/components/payment-panel';
import { getProductCopy } from '@/lib/product-copy';

const statusLabels: Record<TransactionStatus, string> = {
  STARTED: 'Started',
  PAYMENT_PENDING: 'Payment pending',
  PAID: 'Paid',
  VERIFICATION_PENDING: 'Verification pending',
  VERIFICATION_IN_PROGRESS: 'In verification',
  VERIFICATION_COMPLETED: 'Verification complete',
  RESULT_GENERATED: 'Result ready',
  DELIVERED: 'Delivered',
  PAYMENT_FAILED: 'Payment failed',
  AWAITING_PARTICIPANT: 'Awaiting participant',
  EXPIRED: 'Expired',
  VERIFICATION_FAILED: 'Verification failed',
  MANUAL_ATTENTION: 'Manual attention',
};

const activeStatuses: TransactionStatus[] = [
  'STARTED',
  'PAYMENT_PENDING',
  'PAID',
  'VERIFICATION_PENDING',
  'VERIFICATION_IN_PROGRESS',
  'AWAITING_PARTICIPANT',
  'MANUAL_ATTENTION',
];

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function isActiveStatus(status: TransactionStatus) {
  return activeStatuses.includes(status);
}

export function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" className={`focus-ring inline-flex shrink-0 self-start flex-col items-start ${inverse ? 'rounded-lg bg-white px-3 py-2' : ''}`} data-testid="link-brand-home" aria-label="DepositSafe home">
      <img src={`${import.meta.env.BASE_URL}approved-depositsafe-logo.png`} alt="DepositSafe" className="h-9 w-auto mix-blend-multiply" />
      <span className="-mt-1 whitespace-nowrap pl-9 text-[.62rem] font-medium text-[#4e5e74]">Verify with confidence.</span>
    </Link>
  );
}

export function StatusBadge({ status }: { status: TransactionStatus }) {
  const isComplete = ['VERIFICATION_COMPLETED', 'RESULT_GENERATED', 'DELIVERED'].includes(status);
  const isIssue = ['PAYMENT_FAILED', 'EXPIRED', 'VERIFICATION_FAILED', 'MANUAL_ATTENTION'].includes(status);
  const tone = isComplete ? 'text-[#276952] bg-[#e4f0e9] border-[#c7dfd1]' : isIssue ? 'text-[#95463d] bg-[#f7e9e3] border-[#eacdc3]' : 'text-[#7a5d1c] bg-[#f8efd7] border-[#ead9aa]';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[.69rem] font-bold ${tone}`} data-testid={`status-${status}`}>
      <span className="status-dot" />
      {statusLabels[status] ?? status}
    </span>
  );
}

export function QueryError({ message = 'We could not load this right now.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-5 py-6 text-center animate-fade" data-testid="state-error">
      <CircleAlert className="mx-auto mb-2.5 h-6 w-6 text-destructive" />
      <p className="text-sm font-semibold">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">Please try again or come back in a moment.</p>
      {onRetry ? <button type="button" onClick={onRetry} className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-card px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/5" data-testid="button-retry"><RefreshCw className="h-3.5 w-3.5" /> Try again</button> : null}
    </div>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="surface-grid rounded-2xl border border-border/80 px-6 py-12 text-center animate-fade" data-testid="state-empty">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-primary/20 bg-primary/8 text-primary"><FileCheck2 className="h-5 w-5" /></div>
      <h3 className="font-display text-2xl">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{detail}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3 animate-fade" data-testid="state-loading">
      {Array.from({ length: count }).map((_, index) => <div key={index} className="h-[76px] animate-pulse rounded-xl border border-border/70 bg-muted/60" />)}
    </div>
  );
}

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
      <BrandMark />
      <nav className={`${menuOpen ? 'absolute left-4 right-4 top-[4.5rem] flex' : 'hidden'} flex-col gap-1 rounded-2xl border border-border bg-card p-2 shadow-lg md:static md:flex md:flex-row md:items-center md:gap-6 md:border-0 md:bg-transparent md:p-0 md:shadow-none`} data-testid="nav-public">
        <a href="#products" className="focus-ring rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="link-products">Verify products</a>
        <a href="#how-it-works" className="focus-ring rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="link-how-it-works">How it works</a>
        <Link href="/dashboard" className="focus-ring rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid="link-dashboard">Your transactions</Link>
        <Link href="/sign-in" className="focus-ring mt-1 inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-bold hover:bg-muted md:mt-0" data-testid="link-sign-in">Sign in</Link>
      </nav>
      <button type="button" onClick={() => setMenuOpen((value) => !value)} className="focus-ring grid h-10 w-10 place-items-center rounded-lg border border-border bg-card md:hidden" aria-label="Toggle navigation" data-testid="button-toggle-navigation">{menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button>
    </header>
  );
}

export function AppShell({ children, active = 'dashboard', title }: { children: React.ReactNode; active?: 'dashboard' | 'transactions' | 'admin'; title?: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const currentUser = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), staleTime: 60000, retry: false } });
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 30000 } });
  const userLabel = currentUser.data?.displayName ?? 'Customer account';
  const navItems = [
    { id: 'dashboard', label: 'Overview', href: '/dashboard' },
    { id: 'transactions', label: 'Transactions', href: '/dashboard#transactions' },
  ];
  if (location.startsWith('/admin')) navItems.push({ id: 'admin', label: 'Admin oversight', href: '/admin' });
  return (
    <div className="ds-customer min-h-[100dvh] bg-background md:flex">
      <aside className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 flex w-[278px] flex-col bg-sidebar px-5 py-6 text-sidebar-foreground transition-transform duration-300 md:relative md:translate-x-0`} data-testid="sidebar">
        <BrandMark inverse />
        <div className="mt-12">
          <p className="eyebrow px-3 text-sidebar-foreground/50">Workspace</p>
          <nav className="mt-3 space-y-1">
            {navItems.map((item) => <Link key={item.id} href={item.href} onClick={() => setMobileOpen(false)} className={`focus-ring flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${active === item.id ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/66 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid={`link-nav-${item.id}`}>{item.label}{active === item.id ? <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary" /> : null}</Link>)}
          </nav>
        </div>
        <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/45 p-4">
          <div className="text-xs font-bold text-sidebar-foreground">Your DepositSafe checks</div>
          <p className="mt-2 text-[.7rem] leading-5 text-sidebar-foreground/70">Follow the current status of your check records. A check helps inform your decision; it does not guarantee safety.</p>
          <Link href="/help" className="focus-ring mt-3 inline-block text-xs font-semibold text-sidebar-foreground underline">Help and FAQs</Link>
        </div>
      </aside>
      {mobileOpen ? <button type="button" className="fixed inset-0 z-30 bg-foreground/25 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-close-navigation" /> : null}
      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-border/80 px-5 py-4 lg:px-10">
          <button type="button" onClick={() => setMobileOpen(true)} className="focus-ring grid h-10 w-10 place-items-center rounded-lg border border-border bg-card md:hidden" aria-label="Open navigation" data-testid="button-open-navigation"><Menu className="h-4 w-4" /></button>
          <div className="hidden md:block"><p className="eyebrow text-muted-foreground">{title ?? 'Customer workspace'}</p><p className="mt-1 text-sm font-semibold">{userLabel}</p></div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 text-xs font-semibold text-muted-foreground sm:inline-flex"><span className={`status-dot ${health.isError ? 'text-destructive' : 'text-primary'}`} /> {health.isError ? 'Service check failed' : 'Your check records'}</span>
            <Link href="/sign-in" className="focus-ring rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted" data-testid="link-account">Account</Link>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-5 py-8 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const copy = getProductCopy(product.slug);
  return (
    <Link href={`/products/${product.slug}`} className={`group focus-ring block rounded-2xl border border-border bg-card p-5 transition-transform duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_16px_34px_rgba(28,55,63,.08)] animate-rise stagger-${Math.min(index + 1, 4)}`} data-testid={`card-product-${product.slug}`}>
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>
        <span className="font-mono-safe text-xs text-muted-foreground">{product.price || `£${(product.pricePence / 100).toFixed(2)}`}</span>
      </div>
      <h3 className="mt-6 text-base font-extrabold tracking-[-.02em]">{product.name}</h3>
      <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">{copy?.summary ?? `Find out more about ${product.name}.`}</p>
      <div className="mt-5 flex items-center justify-between border-t border-border/70 pt-4 text-xs font-bold text-primary">
        <span>View {product.name}</span>
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

export function ProductGrid() {
  const products = useListProducts({ query: { queryKey: getListProductsQueryKey(), staleTime: 60000 } });
  if (products.isLoading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><SkeletonRows count={6} /></div>;
  if (products.isError) return <QueryError onRetry={() => void products.refetch()} message="DepositSafe checks are temporarily unavailable." />;
  if (!products.data?.length) return <EmptyState title="No checks are available right now" detail="Please visit Help for information about check availability." action={<Link href="/help" className="font-bold text-primary underline">Help and FAQs</Link>} />;
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{products.data.map((product, index) => <ProductCard key={product.slug} product={product} index={index} />)}</div>;
}

export function TransactionForm({ product, products = [], compact = false }: { product?: Product; products?: Product[]; compact?: boolean }) {
  const [, setLocation] = useLocation();
  const createTransaction = useCreateTransaction();
  const createCheckout = useCreateStripeCheckoutSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState(product?.slug ?? products[0]?.slug ?? '');
  const selectedProduct = product ?? products.find((item) => item.slug === selectedSlug);
  const [email, setEmail] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [participantEmail, setParticipantEmail] = useState('');
  const [secondParticipantName, setSecondParticipantName] = useState('');
  const [secondParticipantEmail, setSecondParticipantEmail] = useState('');
  const [formError, setFormError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (isSubmitting) return;
    if (!selectedProduct || !email.trim()) { setFormError('Choose a product and enter your email to continue.'); return; }
    if (selectedProduct.participantMode === 'multiple' && (!participantName.trim() || !participantEmail.trim() || !secondParticipantName.trim() || !secondParticipantEmail.trim())) { setFormError('Add both participants’ names and emails to continue.'); return; }
    const input = {
      productSlug: selectedProduct.slug,
      email: email.trim(),
      ...(selectedProduct.participantMode === 'multiple' ? { participants: [{ name: participantName.trim(), email: participantEmail.trim(), role: 'participant' }, { name: secondParticipantName.trim(), email: secondParticipantEmail.trim(), role: 'participant' }] } : {}),
    };
    setIsSubmitting(true);
    let created: Transaction | undefined;
    let guestAccessStored = false;
    try {
      created = await createTransaction.mutateAsync({ data: input });
      if (created.guestCapability && typeof window !== 'undefined') {
        window.sessionStorage.setItem(`depositsafe:guest-capability:${created.reference}`, created.guestCapability);
        guestAccessStored = true;
      }
      if (!created.isGuest) guestAccessStored = true;
      if (!guestAccessStored) {
        throw new Error('The transaction was created, but guest access could not be saved in this browser.');
      }
      const checkout = await createCheckout.mutateAsync({
        reference: created.reference,
        data: {
          idempotencyKey: checkoutIdempotencyKey(created.reference),
          successUrl: getCheckoutReturnUrl(created.reference, 'success'),
          cancelUrl: getCheckoutReturnUrl(created.reference, 'cancel'),
        },
      });
      if (checkout.paymentStatus === 'failed') throw new Error('The payment provider could not create a checkout session. Please try again.');
      if (!checkout.checkoutSessionReference || !Number.isFinite(checkout.amountPence) || checkout.amountPence < 0) {
        throw new Error('The checkout response was incomplete. Please try again.');
      }
      window.location.assign(secureCheckoutUrl(checkout.checkoutUrl));
    } catch (error) {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : 'We could not start secure checkout. Please try again.';
      if (created && guestAccessStored) {
        try {
          window.sessionStorage.setItem(checkoutErrorStorageKey(created.reference), message.slice(0, 500));
        } catch {
          // The reference remains recoverable from the destination page even if optional error storage is blocked.
        }
        setLocation(`/transactions/${encodeURIComponent(created.reference)}?payment=checkout-error`);
      } else if (created) {
        setFormError(`${message} Keep this reference: ${created.reference}`);
      } else {
        setFormError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <form onSubmit={submit} className={`space-y-4 ${compact ? '' : 'mt-6'}`} data-testid="form-create-transaction">
      {!product ? <label className="block"><span className="mb-2 block text-xs font-bold text-muted-foreground">Choose a DepositSafe check</span><div className="relative"><select value={selectedSlug} onChange={(event) => setSelectedSlug(event.target.value)} className="focus-ring w-full appearance-none rounded-xl border border-input bg-background px-4 py-3 text-sm font-semibold" data-testid="select-product"><option value="">Select a check</option>{products.map((item) => <option key={item.slug} value={item.slug}>{item.name} · {item.price}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" /></div></label> : null}
      <label className="block"><span className="mb-2 block text-xs font-bold text-muted-foreground">Your email address</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="focus-ring w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60" data-testid="input-transaction-email" /></label>
      {selectedProduct?.participantMode === 'multiple' ? (
        <div className="space-y-4 rounded-xl border border-border/70 bg-muted/25 p-4">
          <p className="text-xs font-bold text-foreground">Two people, two identity verifications</p>
          <p className="text-xs leading-5 text-muted-foreground">Each person completes their own identity verification. Use each person’s own name and email address.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-xs font-bold text-muted-foreground">First person’s name</span><input required value={participantName} onChange={(event) => setParticipantName(event.target.value)} placeholder="Full name" className="focus-ring w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60" data-testid="input-participant-name" /></label>
            <label className="block"><span className="mb-2 block text-xs font-bold text-muted-foreground">First person’s email</span><input required type="email" value={participantEmail} onChange={(event) => setParticipantEmail(event.target.value)} placeholder="person@example.com" className="focus-ring w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60" data-testid="input-participant-email" /></label>
            <label className="block"><span className="mb-2 block text-xs font-bold text-muted-foreground">Second person’s name</span><input required value={secondParticipantName} onChange={(event) => setSecondParticipantName(event.target.value)} placeholder="Full name" className="focus-ring w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60" data-testid="input-second-participant-name" /></label>
            <label className="block"><span className="mb-2 block text-xs font-bold text-muted-foreground">Second person’s email</span><input required type="email" value={secondParticipantEmail} onChange={(event) => setSecondParticipantEmail(event.target.value)} placeholder="person@example.com" className="focus-ring w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60" data-testid="input-second-participant-email" /></label>
          </div>
        </div>
      ) : null}
      {formError ? <p className="rounded-lg bg-destructive/8 px-3 py-2 text-xs font-semibold text-destructive" data-testid="text-form-error">{formError}</p> : null}
      <button type="submit" disabled={isSubmitting || createTransaction.isPending || createCheckout.isPending} className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70" data-testid="button-start-transaction">{isSubmitting || createTransaction.isPending || createCheckout.isPending ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" /> : <ArrowRight className="h-4 w-4 shrink-0" />} {isSubmitting || createTransaction.isPending || createCheckout.isPending ? 'Opening checkout…' : selectedProduct ? `Start ${selectedProduct.name}` : 'Choose a check to continue'}</button>
      <p className="text-center text-[.68rem] leading-5 text-muted-foreground">Starting a check opens checkout; verification is not complete until a result is available. If you continue as a guest, keep this browser tab open to retain access. A reference alone does not restore access in a new tab or on another device.</p>
    </form>
  );
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  return (
    <Link href={`/transactions/${transaction.reference}`} className="group flex flex-col gap-3 rounded-xl border border-border/80 bg-card px-4 py-4 transition-colors hover:border-primary/35 hover:bg-primary/[.025] sm:flex-row sm:items-center sm:justify-between" data-testid={`row-transaction-${transaction.reference}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileCheck2 className="h-4 w-4" /></span>
        <div className="min-w-0"><p className="truncate text-sm font-extrabold">{transaction.product.name}</p><p className="mt-1 font-mono-safe text-[.66rem] tracking-wide text-muted-foreground">{transaction.reference} · {formatDate(transaction.createdAt)}</p></div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end"><StatusBadge status={transaction.status} /><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></div>
    </Link>
  );
}

export function ServiceCheck() {
  const [checkedAt, setCheckedAt] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState('');
  const check = async () => {
    setChecking(true);
    try {
      const health = await getHealthCheck();
      setResult(health.status);
      setCheckedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch { setResult('Unavailable'); }
    finally { setChecking(false); }
  };
  return <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={check} disabled={checking} className="focus-ring inline-flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-60" data-testid="button-check-service">{checking ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Check service</button>{result ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground" data-testid="text-service-result"><Check className="h-3.5 w-3.5 text-primary" /> {result} {checkedAt ? `at ${checkedAt}` : ''}</span> : null}</div>;
}