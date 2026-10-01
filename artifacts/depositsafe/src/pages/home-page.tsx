import { useMemo } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Building2, Check, ChevronRight, Clock, FileText, Home, Landmark, ShieldCheck, UserPlus, UserRound, UsersRound, Zap, Lock, KeyRound } from 'lucide-react';
import { getListProductsQueryKey, useListProducts } from '@workspace/api-client-react';
import { PublicLayout, usePageMeta } from '@/components/public/public-layout';

const asset = (f: string) => `${import.meta.env.BASE_URL}${f}`;
const slugify = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

type Card = { name: string; price: string; icon: typeof UserRound; tint: string; desc: string; ticks: [string, string]; note?: string };
const featured: Card[] = [
  { name: 'Verify', price: '£9.99', icon: UserRound, tint: 'bg-sky-100 text-primary', desc: 'Confirm who the person you are dealing with is before you go any further.', ticks: ['Identity verification', 'One reference to follow'] },
  { name: 'Verify Both', price: '£14.99', icon: UsersRound, tint: 'bg-white/20 text-white', desc: 'Both people complete their own identity verification, giving each side greater confidence before moving forward.', ticks: ['Two identity verifications', 'Mutual confidence'] },
  { name: 'Verify Plus', price: '£14.99', icon: UserPlus, tint: 'bg-sky-100 text-primary', desc: 'Combines identity verification and bank account verification, for the moment money is about to move.', ticks: ['Identity verification', 'Bank account verification'] },
];
const small: Card[] = [
  { name: 'Bank Account Check', price: '£7.99', icon: Landmark, tint: 'bg-emerald-100 text-emerald-700', desc: 'Check the bank account details you have been given before you send a payment.', ticks: ['Account details check', 'One reference to follow'] },
  { name: 'Property Ownership Check', price: '£12.99', icon: Home, tint: 'bg-violet-100 text-violet-700', desc: 'Check who owns a property before you pay money in connection with it.', ticks: ['Ownership information', 'Know who you are dealing with'] },
  { name: 'Company Check', price: '£4.99', icon: Building2, tint: 'bg-amber-100 text-amber-700', desc: 'Look up a UK company and see how it appears on the public register.', ticks: ['Company information', 'Public register details'] },
  { name: 'Right to Rent', price: '£19.99', icon: FileText, tint: 'bg-teal-100 text-teal-700', desc: 'A Right to Rent check for a prospective tenant.', ticks: ['Guided process', 'England only'], note: 'England only' },
];

const scenarios = [
  { q: 'I’m about to pay someone', to: 'Verify Plus', icon: Landmark },
  { q: 'We both want to verify each other', to: 'Verify Both', icon: UsersRound },
  { q: 'Someone says they own a property', to: 'Property Ownership Check', icon: Home },
  { q: 'I want to check a person', to: 'Verify', icon: UserRound },
  { q: 'I’m dealing with a company', to: 'Company Check', icon: Building2 },
  { q: 'I need a Right to Rent check', to: 'Right to Rent', icon: KeyRound },
];

export function HomePage() {
  usePageMeta('DepositSafe | Before you pay them, check them.', 'Get the facts before you commit or share sensitive information. Verify the people, businesses and property you’re dealing with.');
  const products = useListProducts({ query: { queryKey: getListProductsQueryKey(), staleTime: 60000 } });
  const slugs = useMemo(() => {
    const m = new Map<string, string>();
    (products.data ?? []).forEach((p) => m.set(p.name.toLowerCase(), p.slug));
    return (name: string) => m.get(name.toLowerCase()) ?? slugify(name);
  }, [products.data]);

  const renderCard = (c: Card, big: boolean) => {
    const id = slugify(c.name);
    const both = c.name === 'Verify Both';
    const Icon = c.icon;
    return (
      <div key={c.name} id={c.name === 'Right to Rent' ? 'right-to-rent' : undefined} className={`relative flex scroll-mt-24 flex-col rounded-xl p-5 ${both ? 'bg-[#006FF0] text-white shadow-[0_20px_40px_-20px_rgba(0,111,240,.8)] lg:-mt-3 lg:pb-6' : 'border border-border bg-[#FEFEFE]'}`} data-testid={`card-check-${id}`}>
        {both ? <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-3 py-0.5 text-[.6rem] font-bold tracking-wider text-primary shadow">TWO-PERSON CHECK</span> : null}
        <div className="flex items-center gap-3">
          <span className={`grid shrink-0 place-items-center rounded-full ${big ? 'h-12 w-12' : 'h-10 w-10'} ${c.tint}`}><Icon className={big ? 'h-6 w-6' : 'h-5 w-5'} /></span>
          <div><h3 className={`font-bold leading-tight ${big ? 'text-base' : 'text-sm'}`}>{c.name}</h3><p className={`font-extrabold ${big ? 'text-2xl' : 'text-xl'}`} data-testid={`text-price-${id}`}>{c.price}</p></div>
        </div>
        {both ? <p className="mt-4 text-lg font-bold leading-snug">You verify them. They verify you.</p> : null}
        <p className={`mt-3 flex-1 text-sm leading-6 ${both ? 'text-white/90' : 'text-muted-foreground'}`}>{c.desc}</p>
        <ul className="mt-4 space-y-1.5 text-xs font-medium">
          {c.ticks.map((t) => <li key={t} className="flex items-center gap-2"><span className={`grid h-4 w-4 place-items-center rounded-full ${both ? 'bg-white/25' : 'bg-primary text-white'}`}><Check className="h-2.5 w-2.5" strokeWidth={4} /></span>{t}</li>)}
        </ul>
        {c.note ? <span className="mt-3 w-fit rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold" data-testid="text-right-to-rent-england">England only</span> : null}
        <Link href={`/products/${slugs(c.name)}`} className={`mt-5 inline-flex items-center justify-center gap-2 rounded-[5px] px-4 py-2.5 text-sm font-semibold ${both ? 'bg-white text-primary hover:bg-sky-50' : 'bg-[#0065D5] text-white hover:brightness-110'}`} data-testid={`link-start-${id}`}>Start {c.name} <ArrowRight className="h-4 w-4" /></Link>
      </div>
    );
  };

  return (
    <PublicLayout>
      <section className="relative overflow-hidden bg-[#F3F8FB]">
        <div className="hp-hero-img absolute inset-y-0 right-0 hidden w-[34%] lg:block" aria-hidden="true">
          <img src={asset('approved-homepage-woman.jpg')} alt="" className="h-full w-full object-cover object-[60%_20%]" fetchPriority="high" />
        </div>
        <div className="relative mx-auto max-w-[1200px] px-5 py-10 lg:px-8 lg:py-12">
          <div className="max-w-xl">
            <p className="text-[.7rem] font-bold tracking-[.16em] text-primary">VERIFICATION CHECKS</p>
            <h1 className="ds-display mt-3 text-4xl font-extrabold leading-[1.08] text-[#002553] sm:text-5xl lg:text-[3.2rem]">Before you pay them,<br /><span className="text-[#0065D5]">check them.</span></h1>
            <p className="mt-4 max-w-md text-[.95rem] leading-6 text-[#2c3e55]">Get the facts before you commit or share sensitive information. DepositSafe makes it simple to verify the people, businesses and property you’re dealing with.</p>
            <a href="#checks" className="mt-5 inline-flex items-center gap-2 rounded-[5px] bg-[#0065D5] px-6 py-3 text-sm font-semibold text-white hover:brightness-110" data-testid="link-hero-view-checks">View our checks <ArrowRight className="h-4 w-4" /></a>
          </div>
          <div className="mt-8 grid max-w-xl gap-4 sm:grid-cols-3">
            {[[ShieldCheck, 'Trusted verification', 'Checks are carried out through data and identity providers.'], [Zap, 'Fast and simple', 'Choose a check and get started online.'], [Lock, 'Greater peace of mind', 'Make more informed decisions.']].map(([I, t, d]) => {
              const Ic = I as typeof Lock;
              return <div key={t as string} className="flex gap-2.5"><Ic className="mt-0.5 h-6 w-6 shrink-0 text-primary" /><div><p className="text-xs font-bold text-[#002553]">{t as string}</p><p className="mt-0.5 text-[.7rem] leading-4 text-muted-foreground">{d as string}</p></div></div>;
            })}
          </div>
          <div className="mt-8 w-full max-w-xs rounded-xl border border-white bg-white/85 p-4 shadow-lg backdrop-blur lg:absolute lg:right-[calc(36%+.5rem)] lg:top-1/2 lg:mt-0 lg:w-44 lg:-translate-y-1/2 lg:translate-x-[45%]" data-testid="list-hero-checklist">
            <ul className="space-y-2.5 text-sm font-medium">
              {['People', 'Property', 'Businesses', 'Bank accounts', 'Right to Rent'].map((t) => <li key={t} className="flex items-center gap-2.5"><span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-white"><Check className="h-3 w-3" strokeWidth={3.5} /></span>{t}</li>)}
            </ul>
          </div>
        </div>
        <div className="lg:hidden"><img src={asset('approved-homepage-woman.jpg')} alt="A smiling woman looking at her phone" className="h-auto w-full" /></div>
      </section>

      <section id="checks" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-10 lg:px-8">
        <div id="pricing" className="scroll-mt-24">
          <p className="text-[.7rem] font-bold tracking-[.16em] text-primary">OUR VERIFICATION CHECKS</p>
          <h2 className="ds-display mt-1 text-2xl font-extrabold text-[#002553] sm:text-3xl">Choose the right check for your situation</h2>
          <p className="mt-1 text-sm text-muted-foreground">Simple, priced checks to help you decide with more confidence. No subscription.</p>
        </div>
        <div id="get-started" className="mt-8 grid scroll-mt-24 gap-5 md:grid-cols-3">{featured.map((c) => renderCard(c, true))}</div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{small.map((c) => renderCard(c, false))}</div>
        <p className="mt-5 text-xs text-muted-foreground">Prices are per check. Right to Rent is for properties in England only. DepositSafe is pre-launch, so availability of individual checks may vary.</p>
      </section>

      <section id="how-it-works" className="scroll-mt-20 bg-[#EAF3FB] py-8">
        <div className="mx-auto grid max-w-[1200px] items-center gap-6 px-5 lg:grid-cols-[1fr_auto] lg:px-8">
          <div>
            <p className="text-[.7rem] font-bold tracking-[.16em] text-primary">HOW IT WORKS</p>
            <h2 className="ds-display mt-1 text-xl font-extrabold text-[#002553] sm:text-2xl">How it works in 3 simple steps</h2>
            <ol className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
              {[['Choose a check', 'Select the check you need.'], ['Enter the details', 'Provide a few details, including your email.'], ['Follow your reference', 'Track progress on one reference.']].flatMap(([t, d], i) => {
                const li = <li key={t} className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0065D5] text-base font-bold text-white">{i + 1}</span><div><p className="text-sm font-bold text-[#002553]">{t}</p><p className="text-xs text-muted-foreground">{d}</p></div></li>;
                return i < 2 ? [li, <ArrowRight key={`a${i}`} className="hidden h-4 w-4 text-primary/50 md:block" aria-hidden="true" />] : [li];
              })}
            </ol>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white/70 p-4 lg:w-72"><Clock className="h-8 w-8 shrink-0 text-primary" /><div><p className="text-sm font-bold text-[#002553]">Simple and secure</p><p className="text-xs text-muted-foreground">Start online as a guest or with an account.</p></div></div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-5 py-8 lg:px-8" aria-labelledby="chooser-title">
        <div className="flex items-end justify-between gap-4">
          <div><h2 id="chooser-title" className="ds-display text-xl font-extrabold text-[#002553] sm:text-2xl">Not sure which check you need?</h2><p className="mt-1 text-sm text-muted-foreground">Choose the situation that sounds most like yours.</p></div>
          <a href="#checks" className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-primary sm:inline-flex">View all checks <ArrowRight className="h-4 w-4" /></a>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scenarios.map((s, i) => (
            <Link key={s.q} href={`/products/${slugs(s.to)}`} className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium hover:border-primary/50" data-testid={`link-scenario-${i}`} aria-label={`${s.q}: ${s.to}`}>
              <s.icon className="h-5 w-5 text-primary" /><span className="flex-1">{s.q}</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#002553] text-white">
        <img src={asset('approved-homepage-keys.jpg')} alt="" className="absolute inset-y-0 left-[40%] hidden h-full w-[28%] object-cover opacity-70 [mask-image:linear-gradient(90deg,transparent,#000_35%,#000_65%,transparent)] lg:block" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-6 px-5 py-10 lg:grid-cols-[1.3fr_.7fr] lg:px-8">
          <div>
            <p className="text-[.7rem] font-bold tracking-[.16em] text-sky-300">GREATER CONFIDENCE. SAFER DECISIONS.</p>
            <h2 className="ds-display mt-2 text-3xl font-extrabold sm:text-4xl">Certainty before commitment.</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/80">Whether you’re paying for a property, working with a business, or sending money to someone, get the facts first.</p>
          </div>
          <ul className="space-y-2.5 text-sm font-medium lg:justify-self-end">
            {['People you can trust', 'Properties you can verify', 'Businesses you can check', 'Payments you can make safely'].map((t) => <li key={t} className="flex items-center gap-2.5"><span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[#002553]"><Check className="h-3 w-3" strokeWidth={4} /></span>{t}</li>)}
          </ul>
        </div>
      </section>
    </PublicLayout>
  );
}
