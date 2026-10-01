import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Menu, X } from 'lucide-react';

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

export function PublicLogo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" data-testid="link-public-logo" aria-label="DepositSafe home">
      <ShieldIcon />
      <span className="leading-none">
        <span className={`ds-display block text-[1.2rem] font-extrabold ${light ? 'text-white' : 'text-[hsl(var(--ds-navy))]'}`}>Deposit<span className={light ? 'text-sky-300' : 'text-primary'}>Safe</span></span>
        <span className={`mt-1 block text-[.64rem] font-semibold tracking-wide ${light ? 'text-white/65' : 'text-muted-foreground'}`}>Verify with confidence.</span>
      </span>
    </Link>
  );
}

const nav = [
  { label: 'Home', href: `${base}/` },
  { label: 'Our Checks', href: `${base}/#checks` },
  { label: 'How It Works', href: `${base}/#how-it-works` },
  { label: 'Pricing', href: `${base}/#pricing` },
  { label: 'Help/FAQs', href: `${base}/help` },
];

function PublicHeader() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const link = 'rounded-lg px-3 py-2 text-sm font-semibold text-foreground/75 hover:bg-secondary hover:text-foreground';
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
        <PublicLogo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {nav.map((n) => <a key={n.label} href={n.href} className={link} data-testid={`link-nav-${n.label.toLowerCase().replace(/\W+/g, '-')}`}>{n.label}</a>)}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/sign-in" className="rounded-lg px-4 py-2.5 text-sm font-bold text-[hsl(var(--ds-navy))] hover:bg-secondary" data-testid="link-public-sign-in">Sign in</Link>
          <a href={`${base}/#get-started`} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover:brightness-110" data-testid="link-public-get-started">Get Started</a>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="public-mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-white lg:hidden" data-testid="button-public-menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <nav id="public-mobile-menu" aria-label="Mobile" className="border-t border-border bg-white px-5 pb-5 pt-3 lg:hidden">
          <div className="flex flex-col">
            {nav.map((n) => <a key={n.label} href={n.href} onClick={() => setOpen(false)} className="border-b border-border/60 py-3.5 text-base font-semibold">{n.label}</a>)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link href="/sign-in" onClick={() => setOpen(false)} className="rounded-lg border border-border py-3 text-center text-sm font-bold">Sign in</Link>
            <a href={`${base}/#get-started`} onClick={() => setOpen(false)} className="rounded-lg bg-primary py-3 text-center text-sm font-bold text-primary-foreground">Get Started</a>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="bg-[hsl(var(--ds-navy))] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <PublicLogo light />
          <p className="mt-5 max-w-sm text-sm leading-6 text-white/65">DepositSafe is a pre-launch service. Checks, availability and providers may change as we open up.</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/50">Service</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><a href={`${base}/#checks`} className="text-white/80 hover:text-white">Our Checks</a></li>
            <li><a href={`${base}/#how-it-works`} className="text-white/80 hover:text-white">How It Works</a></li>
            <li><a href={`${base}/#pricing`} className="text-white/80 hover:text-white">Pricing</a></li>
            <li><Link href="/sign-in" className="text-white/80 hover:text-white">Sign in</Link></li>
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
      <div className="border-t border-white/10 px-5 py-5 text-center text-xs text-white/50">DepositSafe. Verification checks are an aid to your own decisions, not legal or financial advice.</div>
    </footer>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ds-public min-h-[100dvh]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <PublicHeader />
      <main id="main">{children}</main>
      <PublicFooter />
    </div>
  );
}
