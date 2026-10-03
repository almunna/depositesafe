import type { ReactNode } from 'react';
import { ArrowRight, BadgeCheck, FileCheck2, FileText, Globe2, Lock, ScanFace, ShieldCheck, UserCheck } from 'lucide-react';

const checks = [
  { icon: <FileText />, title: 'Their identity document', body: 'A government-issued identity document — such as a passport or driving licence — is checked to confirm that it is genuine and valid.' },
  { icon: <UserCheck />, title: 'Their identity details', body: "The details they've provided are checked against their identity document, including whether the name they've given matches the name on their ID." },
  { icon: <ScanFace />, title: 'That they match their ID', body: 'They take a live selfie, which is compared with the photograph on their identity document to confirm that the person completing the check matches the person pictured on the ID.' },
  { icon: <FileCheck2 />, title: 'The document itself', body: 'Security and authenticity checks are carried out on the identity document. Depending on the document, these can include checking passport-chip information and whether the document has been reported lost, stolen or compromised.' },
];

const uses = [
  { title: "You're about to pay a deposit", body: 'Check the identity of the person you\'re dealing with before you send money.' },
  { title: "You're buying from someone privately", body: "Check that the person you're dealing with can verify the identity they've given you." },
  { title: "You've met someone online", body: "If you've never met someone in person, Verify gives them a way to confirm their identity before you take things further or send money." },
  { title: 'Someone has asked you to verify yourself', body: 'Complete a Verify check to confirm your identity without sending copies of your identity documents directly to them.' },
];

const steps = [
  { title: 'Start Verify', body: 'Start a check for yourself or for the person you want to verify.' },
  { title: 'Complete the identity check', body: 'The person being verified follows the secure process using their identity document and takes a live selfie.' },
  { title: 'The identity is checked', body: 'The identity document and the details provided are checked, and the live selfie is matched against the photograph on the ID.' },
  { title: 'See the result', body: 'The result shows what the identity check established, so it can be considered before deciding what happens next.' },
];

const cta = 'focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground hover:opacity-90';

export function VerifyProductPage({ checkout }: { checkout: ReactNode }) {
  return (
    <div className="overflow-x-hidden">
      <section className="ds-grid border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 lg:grid-cols-[1fr_420px] lg:items-start lg:px-8 lg:py-20">
          <div className="ds-in min-w-0">
            <p className="inline-flex items-center gap-2 text-base font-bold text-primary"><ShieldCheck className="h-5 w-5" /> Verify</p>
            <h1 className="ds-display mt-5 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">Check that the person you're dealing with is who they say they are.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">Whether you're paying a deposit, buying from someone privately or dealing with someone you've met online, Verify gives you a simple way to check their identity before you proceed.</p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <a href="#verify-start" className={cta} data-testid="link-hero-start-verify">Start Verify <ArrowRight className="h-5 w-5" /></a>
              <p className="ds-display text-2xl font-bold text-primary">£9.99 per check</p>
            </div>
          </div>
          <div id="verify-start" aria-labelledby="verify-start-title" role="region" className="min-w-0 scroll-mt-28 rounded-2xl border border-border bg-white p-6 shadow-lg lg:sticky lg:top-24">
            <div className="flex items-end justify-between gap-4 border-b border-border pb-5">
              <p id="verify-start-title" className="whitespace-nowrap text-base font-bold">Start Verify</p>
              <p className="ds-display text-right text-3xl font-bold text-primary">
                £9.99 <span className="mt-1 block text-sm font-semibold text-muted-foreground">per check</span>
              </p>
            </div>
            <div className="mt-5">{checkout}</div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <h2 className="ds-display text-3xl font-extrabold sm:text-4xl">What does Verify check?</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {checks.map((c) => (
            <div key={c.title} className="rounded-2xl border border-border bg-card p-6">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary [&>svg]:h-6 [&>svg]:w-6">{c.icon}</span>
              <h3 className="mt-5 text-xl font-bold">{c.title}</h3>
              <p className="mt-3 text-base leading-7 text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[hsl(var(--ds-navy))] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 className="ds-display text-3xl font-extrabold sm:text-4xl">A photo of an ID isn't the same as verifying it</h2>
            <p className="mt-6 text-xl font-semibold leading-8">A photograph of a passport or driving licence doesn't prove that the document is genuine — or that the person who sent it is the person pictured on it.</p>
            <p className="mt-5 text-lg leading-8 text-white/75">Verify checks the identity document and matches the person completing the check to their ID.</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-6">
            <Lock className="h-7 w-7 text-white" />
            <h3 className="mt-4 text-xl font-bold">Keep sensitive documents private</h3>
            <p className="mt-3 text-lg leading-8 text-white/75">There's no need to send copies of passports or driving licences directly to each other. The person being checked completes the secure verification process themselves.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="flex flex-col gap-5 rounded-2xl bg-secondary p-6 sm:flex-row sm:items-start sm:p-8">
          <Globe2 className="h-10 w-10 shrink-0 text-primary" />
          <div>
            <h2 className="ds-display text-3xl font-extrabold sm:text-4xl">International identity checks</h2>
            <h3 className="mt-4 text-xl font-bold">Not just UK identity documents</h3>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-muted-foreground">Verify can check supported identity documents from around the world. The verification technology covers more than 2,500 identity documents across 195 countries.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
        <h2 className="ds-display text-3xl font-extrabold sm:text-4xl">When might I use Verify?</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {uses.map((u) => (
            <div key={u.title} className="rounded-2xl border border-border bg-card p-6">
              <h3 className="text-xl font-bold">{u.title}</h3>
              <p className="mt-3 text-base leading-7 text-muted-foreground">{u.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <h2 className="ds-display text-3xl font-extrabold sm:text-4xl">How Verify works</h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl bg-muted p-6">
                <span className="ds-display grid h-10 w-10 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground">{i + 1}</span>
                <h3 className="mt-4 text-xl font-bold">{s.title}</h3>
                <p className="mt-3 text-base leading-7 text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <h2 className="ds-display text-3xl font-extrabold sm:text-4xl">What does a successful Verify result tell me?</h2>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border-2 border-primary/30 bg-card p-6 sm:p-8">
            <BadgeCheck className="h-9 w-9 text-primary" />
            <p className="mt-4 text-xl font-semibold leading-8 sm:text-2xl sm:leading-9">The name they've given you matches their verified ID, and the person who completed the check matches the person pictured on that ID.</p>
          </div>
          <div className="rounded-2xl bg-secondary p-6 sm:p-8">
            <h3 className="text-xl font-bold">Verify confirms identity — not trustworthiness.</h3>
            <p className="mt-3 text-lg leading-8 text-muted-foreground">It doesn't tell you whether someone is honest, reliable or safe to transact with. Use the result alongside the other information you have before deciding what to do next.</p>
          </div>
        </div>
      </section>

      <section className="bg-[hsl(var(--ds-navy))] text-white">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8">
          <p className="ds-display text-2xl font-bold text-white/80">£9.99. One check.</p>
          <h2 className="ds-display mt-4 text-3xl font-extrabold sm:text-4xl">Check their identity before you commit.</h2>
          <a href="#verify-start" className={`${cta} mt-8`} data-testid="link-closing-start-verify">Start Verify <ArrowRight className="h-5 w-5" /></a>
        </div>
      </section>
    </div>
  );
}

export default VerifyProductPage;
