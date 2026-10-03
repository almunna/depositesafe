import type { ReactNode } from 'react';
import { PageBrand } from '@/components/page-brand';
import { ArrowRight, BadgeCheck, Camera, FileCheck2, FileText, Globe2, HandCoins, Image as ImageIcon, Lock, ScanFace, ShieldCheck, ShoppingBag, UserCheck, UserRound, Users } from 'lucide-react';

const checks = [
  { icon: <FileText />, title: 'Their identity document', body: 'A government-issued identity document — such as a passport or driving licence — is checked to confirm that it is genuine and valid.' },
  { icon: <UserCheck />, title: 'Their identity details', body: "The details they've provided are checked against their identity document, including whether the name they've given matches the name on their ID." },
  { icon: <ScanFace />, title: 'That they match their ID', body: 'They take a live selfie, which is compared with the photograph on their identity document to confirm that the person completing the check matches the person pictured on the ID.' },
  { icon: <FileCheck2 />, title: 'The document itself', body: 'Security and authenticity checks are carried out on the identity document. Depending on the document, these can include checking passport-chip information and whether the document has been reported lost, stolen or compromised.' },
];

const uses = [
  { icon: <HandCoins />, title: "You're about to pay a deposit", body: 'Check the identity of the person you\'re dealing with before you send money.', tone: 'bg-primary text-primary-foreground', sub: 'text-white/80' },
  { icon: <ShoppingBag />, title: "You're buying from someone privately", body: "Check that the person you're dealing with can verify the identity they've given you.", tone: 'bg-secondary', sub: 'text-muted-foreground' },
  { icon: <Users />, title: "You've met someone online", body: "If you've never met someone in person, Verify gives them a way to confirm their identity before you take things further or send money.", tone: 'bg-white border border-border', sub: 'text-muted-foreground' },
  { icon: <UserRound />, title: 'Someone has asked you to verify yourself', body: 'Complete a Verify check to confirm your identity without sending copies of your identity documents directly to them.', tone: 'bg-[hsl(var(--ds-navy))] text-white', sub: 'text-white/75' },
];

const steps = [
  { title: 'Start Verify', body: 'Start a check for yourself or for the person you want to verify.' },
  { title: 'Complete the identity check', body: 'The person being verified follows the secure process using their identity document and takes a live selfie.' },
  { title: 'The identity is checked', body: 'The identity document and the details provided are checked, and the live selfie is matched against the photograph on the ID.' },
  { title: 'See the result', body: 'The result shows what the identity check established, so it can be considered before deciding what happens next.' },
];

const cta = 'focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground transition hover:opacity-90 motion-safe:hover:-translate-y-0.5';

function Bar({ w, className = '' }: { w: string; className?: string }) {
  return <span className={`block h-2 rounded-full bg-current opacity-20 ${className}`} style={{ width: w }} />;
}

function Stage({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
      <div className="relative grid aspect-[4/5] min-h-32 w-full max-w-[150px] place-items-center rounded-2xl border border-border bg-white shadow-md sm:min-h-40">
        <span className="ds-display absolute -left-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{n}</span>
        {children}
      </div>
      <p className="text-center text-sm font-bold">{label}</p>
    </div>
  );
}

function FlowIllustration() {
  const arrow = <ArrowRight aria-hidden="true" className="mt-12 h-5 w-5 shrink-0 text-primary/60" />;
  return (
    <div role="img" aria-label="Conceptual illustration: identity document, then live selfie, then identity match. Not a screenshot." className="rounded-3xl border border-border bg-white/80 p-4 shadow-xl backdrop-blur sm:p-6">
      <div className="flex items-start justify-between gap-1 text-primary sm:gap-2">
        <Stage n={1} label="Identity document">
          <div className="w-4/5 space-y-3">
            <div className="grid h-14 w-11 place-items-center rounded-md bg-primary/10"><UserRound className="h-7 w-7" /></div>
            <Bar w="90%" /><Bar w="65%" />
          </div>
        </Stage>
        {arrow}
        <Stage n={2} label="Live selfie">
          <div className="relative grid h-24 w-20 max-w-[calc(100%-1rem)] place-items-center rounded-[2.5rem] border-2 border-dashed border-primary/50">
            <ScanFace className="h-10 w-10" />
            <Camera className="absolute -bottom-3 right-0 h-6 w-6 rounded-full bg-white p-1 shadow" />
          </div>
        </Stage>
        {arrow}
        <Stage n={3} label="Identity match">
          <div className="grid place-items-center gap-3">
            <ShieldCheck className="h-14 w-14" />
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground"><BadgeCheck className="h-5 w-5" /></span>
          </div>
        </Stage>
      </div>
      <p className="mt-5 flex items-center justify-center gap-2 text-sm font-bold text-primary"><ShieldCheck className="h-4 w-4" /> DepositSafe Verify</p>
    </div>
  );
}

export function VerifyProductPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="overflow-x-hidden">
      <section className="ds-grid border-b border-border">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 lg:grid-cols-[1.05fr_1fr] lg:px-8 lg:py-24">
          <div className="ds-in min-w-0">
            <PageBrand />
            <p className="inline-flex items-center gap-2 text-base font-bold text-primary"><ShieldCheck className="h-5 w-5" /> Verify</p>
            <h1 className="ds-display mt-5 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">Check that the person you're dealing with is who they say they are.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">Whether you're paying a deposit, buying from someone privately or dealing with someone you've met online, Verify gives you a simple way to check their identity before you proceed.</p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <button type="button" onClick={onStart} className={cta} data-testid="link-hero-start-verify">Start Verify <ArrowRight className="h-5 w-5" /></button>
              <p className="ds-display text-2xl font-bold text-primary">£9.99 per check</p>
            </div>
          </div>
          <div className="min-w-0"><FlowIllustration /></div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <h2 className="ds-display max-w-xl text-3xl font-extrabold sm:text-4xl">What does Verify check?</h2>
        <div className="mt-10 grid gap-4 lg:grid-cols-6">
          {checks.map((c, i) => (
            <div key={c.title} className={`flex gap-5 rounded-3xl p-6 sm:p-8 ${i === 0 || i === 3 ? 'lg:col-span-4' : 'lg:col-span-2 flex-col'} ${i % 2 ? 'bg-secondary' : 'border border-border bg-card'} ${i === 1 ? 'lg:col-start-5 lg:row-start-1' : ''}`}>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground [&>svg]:h-6 [&>svg]:w-6">{c.icon}</span>
              <div className="min-w-0">
                <h3 className="text-xl font-bold">{c.title}</h3>
                <p className="mt-3 text-base leading-7 text-muted-foreground">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[hsl(var(--ds-navy))] text-white">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <h2 className="ds-display max-w-3xl text-3xl font-extrabold sm:text-4xl">A photo of an ID isn't the same as verifying it</h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/15 sm:p-8">
              <div className="flex items-center gap-4 text-white/60">
                <span className="grid h-20 w-28 -rotate-3 place-items-center rounded-xl border border-dashed border-white/40"><ImageIcon className="h-8 w-8" /></span>
                <span className="space-y-2"><Bar w="80px" /><Bar w="56px" /></span>
              </div>
              <p className="mt-6 text-xl font-semibold leading-8">A photograph of a passport or driving licence doesn't prove that the document is genuine — or that the person who sent it is the person pictured on it.</p>
            </div>
            <div className="rounded-3xl bg-white p-6 text-foreground sm:p-8">
              <div className="flex items-center gap-4 text-primary">
                <span className="relative grid h-20 w-28 place-items-center rounded-xl bg-primary/10"><FileText className="h-8 w-8" /><BadgeCheck className="absolute -right-3 -top-3 h-8 w-8 rounded-full bg-white" /></span>
                <ScanFace className="h-10 w-10" />
              </div>
              <p className="mt-6 text-xl font-semibold leading-8">Verify checks the identity document and matches the person completing the check to their ID.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-4 rounded-3xl bg-white/10 p-6 sm:flex-row sm:items-start sm:p-8">
            <Lock className="h-7 w-7 shrink-0" />
            <div>
              <h3 className="text-xl font-bold">Keep sensitive documents private</h3>
              <p className="mt-3 text-lg leading-8 text-white/75">There's no need to send copies of passports or driving licences directly to each other. The person being checked completes the secure verification process themselves.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-secondary p-6 sm:p-10">
          <Globe2 aria-hidden="true" className="absolute -right-10 -top-10 h-64 w-64 text-primary/10" />
          <div className="relative">
            <h2 className="ds-display text-3xl font-extrabold sm:text-4xl">International identity checks</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 shadow-sm"><p className="ds-display text-5xl font-extrabold text-primary md:text-6xl xl:text-7xl">2,500+</p><p className="mt-2 text-lg font-bold">identity documents</p></div>
              <div className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-sm"><p className="ds-display text-5xl font-extrabold md:text-6xl xl:text-7xl">195</p><p className="mt-2 text-lg font-bold">countries</p></div>
            </div>
            <h3 className="mt-8 text-xl font-bold">Not just UK identity documents</h3>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-muted-foreground">Verify can check supported identity documents from around the world. The verification technology covers more than 2,500 identity documents across 195 countries.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
        <h2 className="ds-display text-3xl font-extrabold sm:text-4xl">When might I use Verify?</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {uses.map((u, i) => (
            <div key={u.title} className={`rounded-3xl p-6 sm:p-8 ${u.tone} ${i % 2 === 1 ? 'md:translate-y-6' : ''}`}>
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/20 [&>svg]:h-6 [&>svg]:w-6">{u.icon}</span>
              <h3 className="mt-8 text-xl font-bold">{u.title}</h3>
              <p className={`mt-3 text-base leading-7 ${u.sub}`}>{u.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-white">
        <div className="mx-auto max-w-4xl px-5 py-20 lg:px-8">
          <h2 className="ds-display text-3xl font-extrabold sm:text-4xl">How Verify works</h2>
          <ol className="relative mt-10 space-y-8 before:absolute before:bottom-4 before:left-5 before:top-4 before:w-px before:bg-primary/25">
            {steps.map((s, i) => (
              <li key={s.title} className="relative flex gap-5">
                <span className="ds-display relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground">{i + 1}</span>
                <div className="min-w-0 pt-1">
                  <h3 className="text-xl font-bold">{s.title}</h3>
                  <p className="mt-2 text-base leading-7 text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <h2 className="ds-display text-3xl font-extrabold sm:text-4xl">What does a successful Verify result tell me?</h2>
        <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border-2 border-primary/30 bg-card p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3 text-primary">
              <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-xs font-bold sm:text-sm"><UserCheck className="h-4 w-4" /> Name <ArrowRight className="h-3.5 w-3.5" /> verified ID <BadgeCheck className="h-4 w-4" /></span>
              <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-xs font-bold sm:text-sm"><ScanFace className="h-4 w-4" /> Person <ArrowRight className="h-3.5 w-3.5" /> ID photo <BadgeCheck className="h-4 w-4" /></span>
            </div>
            <p className="mt-6 text-xl font-semibold leading-8 sm:text-2xl sm:leading-9">The name they've given you matches their verified ID, and the person who completed the check matches the person pictured on that ID.</p>
          </div>
          <div className="rounded-3xl bg-secondary p-6 sm:p-8">
            <h3 className="text-xl font-bold">Verify confirms identity — not trustworthiness.</h3>
            <p className="mt-3 text-lg leading-8 text-muted-foreground">It doesn't tell you whether someone is honest, reliable or safe to transact with. Use the result alongside the other information you have before deciding what to do next.</p>
          </div>
        </div>
      </section>

      <section className="bg-[hsl(var(--ds-navy))] text-white">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8">
          <p className="ds-display text-2xl font-bold text-white/80">£9.99. One check.</p>
          <h2 className="ds-display mt-4 text-3xl font-extrabold sm:text-4xl">Check their identity before you commit.</h2>
          <button type="button" onClick={onStart} className={`${cta} mt-8`} data-testid="link-closing-start-verify">Start Verify <ArrowRight className="h-5 w-5" /></button>
        </div>
      </section>
    </div>
  );
}

export default VerifyProductPage;
