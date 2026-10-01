import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Check, Eye, FileText, Lock, MapPin, ShieldCheck, UserRound } from 'lucide-react';
import { getListProductsQueryKey, useListProducts } from '@workspace/api-client-react';
import { PublicLayout, usePageMeta } from '@/components/public/public-layout';

const heroSrc = `${import.meta.env.BASE_URL}hero-woman-phone.jpg`;

type Check = { name: string; price: string; blurb: string; note?: string };
const slugify = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const catalogue: Check[] = [
  { name: 'Company Check', price: '£4.99', blurb: 'Look up a UK company and see how it appears on the public register.' },
  { name: 'Bank Account Check', price: '£7.99', blurb: 'Check bank details before you send a payment.' },
  { name: 'Verify', price: '£9.99', blurb: 'Check the person you are dealing with before you go further.' },
  { name: 'Property Ownership Check', price: '£12.99', blurb: 'Check who owns a property before you commit to a deal.' },
  { name: 'Verify Both', price: '£14.99', blurb: 'Two people, two identity checks. Each of you verifies the other, so both sides can make a more informed decision.' },
  { name: 'Verify Plus', price: '£14.99', blurb: 'Combines identity verification and bank account verification, for the moment money is about to move.' },
  { name: 'Right to Rent', price: '£19.99', blurb: 'A Right to Rent check for a prospective tenant.', note: 'England only' },
];
const by = (n: string) => catalogue.find((c) => c.name === n)!;

const scenarios = [
  { q: 'I am about to rent out a property', pick: 'Right to Rent', why: 'Landlords and agents in England can check a tenant’s right to rent.' },
  { q: 'Someone has asked me to pay a deposit', pick: 'Verify Plus', why: 'Check identity and bank account details before you pay.' },
  { q: 'I am dealing with a stranger in a private deal', pick: 'Verify Both', why: 'Each of you verifies the other, so trust runs both ways.' },
  { q: 'I am buying or letting through a company', pick: 'Company Check', why: 'See how the company appears on the public register.' },
  { q: 'I want to confirm who owns a property', pick: 'Property Ownership Check', why: 'Check ownership before you hand over money or sign.' },
  { q: 'I only have bank details to go on', pick: 'Bank Account Check', why: 'Check the account details you have been given.' },
];

function CheckCard({ c, slug }: { c: Check; slug: string }) {
  const id = slugify(c.name);
  const both = c.name === 'Verify Both';
  const base = 'group flex h-full flex-col rounded-3xl p-7 transition hover:-translate-y-0.5';
  const tone = both
    ? 'bg-primary text-white shadow-[0_28px_50px_-24px_hsl(220_86%_40%/.9)] lg:col-span-2'
    : 'border border-border bg-white hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_hsl(220_80%_30%/.35)]';
  return (
    <Link href={`/products/${slug}`} className={`${base} ${tone}`} data-testid={`card-check-${id}`}>
      {both ? (
        <div className="mb-5 flex items-center" aria-hidden="true">
          <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-white/60 bg-white/15"><UserRound className="h-5 w-5" /></span>
          <span className="relative z-10 -mx-1.5 grid h-7 w-7 place-items-center rounded-full bg-white text-primary ring-4 ring-primary"><Check className="h-4 w-4" strokeWidth={3.5} /></span>
          <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-white/60 bg-white/15"><UserRound className="h-5 w-5" /></span>
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <h3 className={`ds-display font-bold ${both ? 'text-2xl' : 'text-lg'}`}>{c.name}</h3>
        <span className={`ds-display font-extrabold ${both ? 'text-3xl' : 'text-xl text-primary'}`} data-testid={`text-price-${id}`}>{c.price}</span>
      </div>
      {both ? <p className="ds-display mt-3 text-lg font-bold text-sky-100">You verify them. They verify you.</p> : null}
      <p className={`mt-2 flex-1 text-sm leading-6 ${both ? 'text-white/85' : 'text-muted-foreground'}`}>{c.blurb}</p>
      <div className={`mt-6 flex items-center justify-between text-sm font-bold ${both ? 'text-white' : 'text-primary'}`}>
        <span>{c.note ? <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground" data-testid="text-right-to-rent-england">{c.note}</span> : 'View check'}</span>
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

export function HomePage() {
  usePageMeta('DepositSafe | Before you pay them, check them.', 'Check people, businesses and property before you commit, send money or share sensitive information.');
  const products = useListProducts({ query: { queryKey: getListProductsQueryKey(), staleTime: 60000 } });
  const slugs = useMemo(() => {
    const m = new Map<string, string>();
    (products.data ?? []).forEach((p) => m.set(p.name.toLowerCase(), p.slug));
    return (name: string) => m.get(name.toLowerCase()) ?? slugify(name);
  }, [products.data]);
  const [scenario, setScenario] = useState(0);
  const sc = scenarios[scenario];
  const picked = by(sc.pick);

  return (
    <PublicLayout>
      <section className="relative overflow-hidden bg-gradient-to-b from-[hsl(210_80%_95%)] to-[hsl(210_60%_98%)]">
        <div className="ds-grid absolute inset-0 [mask-image:linear-gradient(180deg,#000,transparent_80%)]" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-8 lg:pb-20 lg:pt-16">
          <div className="ds-in order-2 lg:order-1">
            <h1 className="ds-display text-[2.6rem] font-extrabold leading-[1.04] text-[hsl(var(--ds-navy))] sm:text-6xl lg:text-[4rem]">Before you pay them, check them.</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">Check people, businesses and property before you commit, send money or share sensitive information.</p>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2.5 text-sm font-semibold" data-testid="list-hero-checklist">
              {['People', 'Property', 'Businesses', 'Bank accounts', 'Right to Rent'].map((t) => (
                <li key={t} className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-white"><Check className="h-3 w-3" strokeWidth={3.5} /></span>{t}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#checks" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-7 py-4 text-base font-bold text-primary-foreground shadow-[0_14px_30px_-12px_hsl(220_86%_46%/.8)] hover:brightness-110" data-testid="link-hero-view-checks">View our checks <ArrowRight className="h-4 w-4" /></a>
              <a href="#how-it-works" className="inline-flex items-center justify-center rounded-xl border border-[hsl(var(--ds-navy)/.2)] bg-white px-7 py-4 text-base font-bold text-[hsl(var(--ds-navy))] hover:bg-secondary" data-testid="link-hero-how">How it works</a>
            </div>
          </div>
          <div className="ds-in relative order-1 lg:order-2" style={{ animationDelay: '120ms' }}>
            <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-primary/20 to-transparent" aria-hidden="true" />
            <div className="relative aspect-[4/3.4] overflow-hidden rounded-[1.75rem] shadow-[0_40px_70px_-30px_hsl(222_70%_20%/.6)] lg:aspect-[4/4.6]">
              <img src={heroSrc} alt="A smiling woman looking at her phone" className="h-full w-full object-cover object-[60%_30%]" fetchPriority="high" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-white" aria-label="Why DepositSafe">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          {[[Lock, 'Fixed, published prices', 'The price you see is the price of the check.'], [FileText, 'One reference per check', 'Follow progress from start to result.'], [Eye, 'Plain-English process', 'No jargon, no hidden steps.'], [MapPin, 'Built for the UK', 'Made around UK property and payments.']].map(([Icon, t, d]) => {
            const I = Icon as typeof Lock;
            return <div key={t as string} className="flex gap-3.5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><I className="h-5 w-5" /></span><div><p className="text-sm font-extrabold">{t as string}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{d as string}</p></div></div>;
          })}
        </div>
      </section>

      <section id="checks" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 lg:px-8 lg:py-24">
        <div id="pricing" className="max-w-2xl scroll-mt-24">
          <h2 className="ds-display text-3xl font-extrabold text-[hsl(var(--ds-navy))] sm:text-5xl">Choose the right check for your situation</h2>
          <p className="mt-4 text-lg leading-7 text-muted-foreground">Each check is priced individually, with no subscription to sign up to.</p>
        </div>
        <div id="get-started" className="mt-12 grid scroll-mt-24 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {catalogue.map((c) => <CheckCard key={c.name} c={c} slug={slugs(c.name)} />)}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">Prices are per check. Right to Rent is available for properties in England only. DepositSafe is pre-launch, so availability of individual checks may vary.</p>
      </section>

      <section id="how-it-works" className="scroll-mt-20 bg-secondary/60 py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <h2 className="ds-display text-3xl font-extrabold text-[hsl(var(--ds-navy))] sm:text-5xl">How it works</h2>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {[['Choose your check', 'Pick the check that fits your situation.'], ['Enter the details', 'Give us your email and, where needed, the other person’s details.'], ['Follow your reference', 'Track progress on one reference, as a guest or with an account.']].map(([t, d], i) => (
              <li key={t} className="rounded-3xl bg-white p-7"><span className="ds-display grid h-12 w-12 place-items-center rounded-2xl bg-primary text-lg font-extrabold text-white">{i + 1}</span><h3 className="ds-display mt-5 text-xl font-bold">{t}</h3><p className="mt-2 text-base leading-7 text-muted-foreground">{d}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24" aria-labelledby="chooser-title">
        <div className="grid gap-10 lg:grid-cols-[.95fr_1.05fr]">
          <div>
            <h2 id="chooser-title" className="ds-display text-3xl font-extrabold text-[hsl(var(--ds-navy))] sm:text-4xl">Not sure which check you need?</h2>
            <p className="mt-4 text-lg leading-7 text-muted-foreground">Choose the situation closest to yours and we will point you to the right one.</p>
            <div role="radiogroup" aria-label="Your situation" className="mt-7 space-y-2.5">
              {scenarios.map((s, i) => (
                <button key={s.q} type="button" role="radio" aria-checked={i === scenario} onClick={() => setScenario(i)} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left text-sm font-bold transition ${i === scenario ? 'border-primary bg-white shadow-md ring-2 ring-primary/20' : 'border-border bg-white/70 hover:bg-white'}`} data-testid={`button-scenario-${i}`}>
                  {s.q}<span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${i === scenario ? 'border-primary bg-primary text-white' : 'border-border'}`}>{i === scenario ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center">
            <div className="w-full rounded-3xl border border-border bg-[hsl(210_80%_96%)] p-8 sm:p-10" aria-live="polite" data-testid="panel-recommendation">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">We suggest</p>
              <div className="mt-4 flex items-end justify-between gap-4"><h3 className="ds-display text-3xl font-extrabold text-[hsl(var(--ds-navy))] sm:text-4xl">{picked.name}</h3><span className="ds-display text-3xl font-extrabold text-primary">{picked.price}</span></div>
              <p className="mt-5 text-base leading-7 text-muted-foreground">{sc.why}</p>
              {picked.note ? <p className="mt-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-bold">{picked.note}</p> : null}
              <div><Link href={`/products/${slugs(picked.name)}`} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-white hover:brightness-110" data-testid="link-recommended-check">Go to {picked.name} <ArrowRight className="h-4 w-4" /></Link></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-[hsl(var(--ds-navy))] px-8 py-14 text-center text-white sm:px-14">
          <div className="ds-grid absolute inset-0 opacity-25" aria-hidden="true" />
          <div className="relative">
            <ShieldCheck className="mx-auto h-10 w-10 text-sky-300" />
            <h2 className="ds-display mx-auto mt-5 max-w-2xl text-3xl font-extrabold sm:text-5xl">Certainty before commitment.</h2>
            <div className="mt-8 flex justify-center">
              <a href="#checks" className="rounded-xl bg-primary px-7 py-4 text-base font-bold text-white hover:brightness-110" data-testid="link-closing-checks">View our checks</a>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
