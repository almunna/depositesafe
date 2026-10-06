import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Menu, Search, X } from 'lucide-react';
import { useAccount } from '@/hooks/use-account';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute('name', 'description'); document.head.appendChild(tag); }
    tag.setAttribute('content', description);
  }, [title, description]);
}

export function ShieldIcon({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 56" className={className} aria-hidden="true">
      <defs><linearGradient id="dsShield" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2f6bff" /><stop offset="1" stopColor="#0f2457" /></linearGradient></defs>
      <path d="M24 2 5 9v17c0 14 8 24 19 28 11-4 19-14 19-28V9z" fill="url(#dsShield)" />
      <path d="M24 8 10 13.5V26c0 10.5 6 18.5 14 22 8-3.5 14-11.5 14-22V13.5z" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
      <path d="m16 27.5 6 6 11-12.5" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PublicLogo({ light = false, logoSrc, header = false }: { light?: boolean; logoSrc?: string; header?: boolean }) {
  return (
    <Link href="/" className={`inline-flex shrink-0 flex-col ${light ? 'rounded-lg bg-white px-3 py-2' : ''}`} data-testid="link-public-logo" aria-label="DepositSafe home">
      <img src={logoSrc ?? `${import.meta.env.BASE_URL}approved-depositsafe-logo.png`} alt="DepositSafe" className={`${header ? '-my-2 h-16 xl:-my-3 xl:h-[4.75rem]' : 'h-9'} w-auto mix-blend-multiply`} />
    </Link>
  );
}

const nav = [
  { label: 'Home', href: `${base}/` },
  { label: 'Our Checks', href: `${base}/#checks` },
  { label: 'How It Works', href: `${base}/#how-it-works` },
  { label: 'Landlords & Agents', href: `${base}/#right-to-rent` },
  { label: 'Pricing', href: `${base}/#pricing` },
  { label: 'FAQs', href: `${base}/help` },
  { label: 'Help', href: `${base}/help` },
];

const searchItems = [
  ['Verify', 'verify'], ['Verify Both', 'verify-both'], ['Verify Plus', 'verify-plus'], ['Bank Account Check', 'bank-account-check'],
  ['Property Ownership Check', 'property-ownership-check'], ['Company Check', 'company-check'], ['Right to Rent', 'right-to-rent'],
];

function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const hits = searchItems.filter(([n]) => n.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Search checks" className="grid h-10 w-10 place-items-center rounded-full hover:bg-secondary" data-testid="button-public-search"><Search className="h-4 w-4" /></button>
      {open ? (
        <div className="absolute right-0 top-12 z-50 w-72 rounded-xl border border-border bg-white p-3 shadow-xl">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} placeholder="Search checks" aria-label="Search checks" className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none" data-testid="input-public-search" />
          <ul className="mt-2 max-h-64 overflow-auto">
            {hits.length ? hits.map(([n, slug]) => <li key={slug}><Link href={`/products/${slug}`} onClick={() => { setOpen(false); setQ(''); }} className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-secondary">{n}</Link></li>) : <li className="px-3 py-2 text-sm text-muted-foreground">No matching checks</li>}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PublicHeader({ logoSrc, homepage = false }: { logoSrc?: string; homepage?: boolean }) {
  const [open, setOpen] = useState(false);
  const { isSignedIn, signOut } = useAccount();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const items = [...nav.slice(0, 5), { label: 'Help & FAQs', href: `${base}/help` }];
  const link = 'whitespace-nowrap rounded-lg px-2 py-2 text-xs font-semibold text-foreground/75 hover:bg-secondary hover:text-foreground xl:px-2.5 xl:text-[13px] 2xl:px-3 2xl:text-sm';
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-white/95 shadow-[0_1px_0_hsl(var(--primary)/0.12)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 sm:px-5 xl:px-8 xl:py-3">
        <PublicLogo header logoSrc={logoSrc} />
        <nav className={`hidden items-center gap-1 xl:flex`} aria-label="Main">
          {items.map((n) => <a key={n.label} href={n.href} className={link} data-testid={`link-nav-${n.label.toLowerCase().replace(/\W+/g, '-')}`}>{n.label}</a>)}
        </nav>
        <div className={`hidden items-center gap-2 xl:flex`}>
          <HeaderSearch />
          {isSignedIn ? (
            <>
              <Link href="/dashboard" className="whitespace-nowrap rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary hover:bg-secondary" data-testid="link-public-dashboard">Your checks</Link>
              <button type="button" onClick={() => void signOut()} className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-foreground/75 hover:bg-secondary hover:text-foreground" data-testid="button-public-sign-out">Sign out</button>
            </>
          ) : (
            <Link href="/sign-in" className="whitespace-nowrap rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary hover:bg-secondary" data-testid="link-public-sign-in">Sign in</Link>
          )}
          <a href={`${base}/#get-started`} className="whitespace-nowrap rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-110" data-testid="link-public-get-started">Get Started</a>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="public-mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} className={`grid h-11 w-11 place-items-center rounded-lg border border-border bg-white xl:hidden`} data-testid="button-public-menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <nav id="public-mobile-menu" aria-label="Mobile" className={`max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain border-t border-border bg-white px-5 pb-6 pt-3 shadow-lg xl:hidden`}>
          <div className="flex flex-col">
            {items.map((n) => <a key={n.label} href={n.href} onClick={() => setOpen(false)} className="border-b border-border/60 py-3.5 text-base font-semibold">{n.label}</a>)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {isSignedIn
              ? <Link href="/dashboard" onClick={() => setOpen(false)} className="rounded-lg border border-border py-3 text-center text-sm font-bold" data-testid="link-mobile-dashboard">Your checks</Link>
              : <Link href="/sign-in" onClick={() => setOpen(false)} className="rounded-lg border border-border py-3 text-center text-sm font-bold">Sign in</Link>}
            <a href={`${base}/#get-started`} onClick={() => setOpen(false)} className="rounded-lg bg-primary py-3 text-center text-sm font-bold text-primary-foreground">Get Started</a>
            {isSignedIn ? <button type="button" onClick={() => { setOpen(false); void signOut(); }} className="col-span-2 rounded-lg border border-border py-3 text-center text-sm font-bold" data-testid="button-mobile-sign-out">Sign out</button> : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export function PublicFooter({ companyCheck = false, homepage = false, logoSrc }: { companyCheck?: boolean; homepage?: boolean; logoSrc?: string }) {
  const { isSignedIn } = useAccount();
  return (
    <footer className="bg-[hsl(var(--ds-navy))] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <PublicLogo light logoSrc={homepage ? logoSrc : undefined} />
          <p className="mt-5 max-w-sm text-sm leading-6 text-white/65">{homepage ? 'Helping you check the details that matter before you commit.' : companyCheck ? 'Know more about the business you’re dealing with. Your Company Check, clearly presented and saved with DepositSafe.' : 'DepositSafe is a pre-launch service. Checks, availability and providers may change as we open up.'}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/50">Service</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><a href={`${base}/#checks`} className="text-white/80 hover:text-white">Our Checks</a></li>
            <li><a href={`${base}/#how-it-works`} className="text-white/80 hover:text-white">How It Works</a></li>
            <li><a href={`${base}/#pricing`} className="text-white/80 hover:text-white">Pricing</a></li>
            <li>{isSignedIn ? <Link href="/dashboard" className="text-white/80 hover:text-white">Your checks</Link> : <Link href="/sign-in" className="text-white/80 hover:text-white">Sign in</Link>}</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/50">Information</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/help" className="text-white/80 hover:text-white">Help and FAQs</Link></li>
            <li><Link href="/terms" className="text-white/80 hover:text-white">Terms</Link></li>
            <li><Link href="/privacy" className="text-white/80 hover:text-white">Privacy</Link></li>
            <li><Link href="/refunds" className="text-white/80 hover:text-white">Refunds and cancellations</Link></li>
          </ul>
        </div>
      </div>
      <div className={`border-t border-white/10 px-5 py-5 text-center text-white/50 ${homepage ? 'text-sm leading-6' : 'text-xs'}`}>{homepage ? 'DepositSafe checks provide information to support your decisions. They are not legal or financial advice.' : 'DepositSafe. Verification checks are an aid to your own decisions, not legal or financial advice.'}</div>
    </footer>
  );
}

export function PublicLayout({ children, companyCheck = false, homepage = false, logoSrc }: { children: ReactNode; companyCheck?: boolean; homepage?: boolean; logoSrc?: string }) {
  return (
    <div className="ds-public min-h-[100dvh]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <PublicHeader logoSrc={homepage ? logoSrc : undefined} homepage={homepage} />
      <main id="main">{children}</main>
      <PublicFooter companyCheck={companyCheck} homepage={homepage} logoSrc={logoSrc} />
    </div>
  );
}
