import { useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CheckCircle2, ChevronDown, LoaderCircle } from 'lucide-react';
import { useSubmitContactMessage } from '@workspace/api-client-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PublicLayout, usePageMeta } from '@/components/public/public-layout';
import { PageBrand } from '@/components/page-brand';

function PageHead({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <div className="border-b border-border bg-gradient-to-b from-[hsl(210_80%_95%)] to-[hsl(210_60%_98%)]">
      <div className="mx-auto max-w-4xl px-5 py-14 lg:py-20">
        <PageBrand />
        <p className="text-sm font-bold text-primary">{eyebrow}</p>
        <h1 className="ds-display mt-3 text-4xl font-extrabold text-[hsl(var(--ds-navy))] sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-7 text-muted-foreground">{intro}</p>
      </div>
    </div>
  );
}

function Policy({ title, description, intro, sections }: { title: string; description: string; intro: string; sections: [string, ReactNode][] }) {
  usePageMeta(`${title} | DepositSafe`, description);
  return (
    <PublicLayout>
      <PageHead eyebrow="Pre-launch information" title={title} intro={intro} />
      <div className="mx-auto max-w-3xl space-y-9 px-5 py-14">
        {sections.map(([h, body]) => (
          <section key={h}><h2 className="ds-display text-xl font-bold text-[hsl(var(--ds-navy))]">{h}</h2><div className="mt-3 space-y-3 text-base leading-7 text-muted-foreground">{body}</div></section>
        ))}
        <p className="rounded-xl bg-secondary p-4 text-sm text-foreground">Questions about this page? Use the form on the <Link href="/help" className="font-bold text-primary underline">Help page</Link>.</p>
      </div>
    </PublicLayout>
  );
}

export function TermsPage() {
  return <Policy title="Terms of use" description="Plain-English terms for using DepositSafe during its pre-launch period." intro="These terms are a plain-English summary of how DepositSafe works while we are pre-launch. They may be updated as the service develops." sections={[
    ['What DepositSafe does', <p key="a">DepositSafe lets you start verification checks on people, bank accounts, property and businesses. A check is an aid to your own decision. It is not legal, financial or investment advice, and it does not guarantee any outcome.</p>],
    ['Pre-launch availability', <p key="a">The service is pre-launch. Some checks may be unavailable, limited or change without notice, and prices shown are for the check itself. Right to Rent is for properties in England only.</p>],
    ['Using the service', <p key="a">Please give accurate details and only start a check about someone where you have a proper reason to do so. Do not use the service for unlawful purposes.</p>],
    ['Your statutory rights', <p key="a">Nothing in these terms limits any rights you have under UK consumer law that cannot lawfully be limited.</p>],
    ['Changes and contact', <p key="a">We may update these terms as the service launches fully. If you have questions, please use our Help page.</p>],
  ]} />;
}

export function PrivacyPage() {
  return <Policy title="Privacy" description="What information DepositSafe collects, why, and how to ask about it." intro="We aim to collect only what we need to run your check and answer your questions." sections={[
    ['What we collect', <><p key="a">When you start a check, we collect your email address and, for checks involving other people, the names and email addresses you provide for them. We also keep a reference and status for each check.</p><p key="b">When you contact us through Help, we collect your name, email address, topic and message so we can reply.</p></>],
    ['What not to send us', <p key="a">Please do not send ID documents, bank details or passwords through the contact form or by email. We do not need them to answer a question.</p>],
    ['Accounts', <p key="a">Sign-in is handled by our authentication provider. DepositSafe does not store your password.</p>],
    ['How we use it', <p key="a">We use your information to manage the checks you request, keep your transaction records and respond to enquiries. Our service suppliers may process information needed for hosting, account sign-in or a requested verification check.</p>],
    ['Storage and retention', <p key="a">Contact enquiries and transaction records are stored in our service database. We retain information while needed to handle your request, operate the service or meet applicable record-keeping obligations. You can ask about retention or request deletion through Help.</p>],
    ['Sign-in and essential storage', <p key="a">Our account provider uses essential cookies or similar storage to maintain sign-in sessions. Your browser also stores the access reference needed to return to a guest check. Do not share your check access link with anyone you do not trust.</p>],
    ['Your choices', <p key="a">You can ask what we hold about you, or ask us to correct or delete it, by contacting us through Help and choosing the privacy topic. Your rights under UK data protection law apply.</p>],
  ]} />;
}

export function RefundsPage() {
  return <Policy title="Refunds and cancellations" description="How to request a refund or cancel a DepositSafe check during pre-launch." intro="How to contact us about a refund or cancellation. Your statutory rights always apply." sections={[
    ['Your statutory rights', <p key="a">You keep all rights you have under UK consumer law. Nothing on this page reduces them.</p>],
    ['If something goes wrong', <p key="a">If a check cannot be completed, was charged in error, or you were charged twice, please tell us and we will look at it fairly and in line with the law.</p>],
    ['Digital services', <p key="a">Checks are digital services that begin processing once started, so whether a refund is due can depend on how far a check has progressed. We will assess each request on its own facts.</p>],
    ['Cancelling a check', <p key="a">If you want to cancel, contact us as soon as possible using the order topic on Help and include your check reference. We will review whether processing has started and explain the options. Starting a check does not automatically remove your statutory cancellation rights.</p>],
    ['How to ask', <p key="a">Use the Help page, choose the order topic, and include your check reference. Do not include bank details.</p>],
  ]} />;
}

const faqs: [string, string][] = [
  ['What is DepositSafe?', 'A service for UK landlords, agents and people in property-related transactions to run checks on people, bank accounts, property and businesses before committing or sending money.'],
  ['Do I need an account?', 'No. You can start a check as a guest, but keep its original browser tab open to retain access. A reference alone does not restore access in a new tab or on another device. An account keeps the checks started using that account together.'],
  ['Is the service live?', 'DepositSafe is pre-launch. Some checks may be limited or unavailable while we open up.'],
  ['What does Right to Rent cover?', 'A Right to Rent check for landlords and letting agents checking a prospective tenant for a property in England only.'],
  ['What is Verify Both?', 'You verify them. They verify you. Two people each complete their own identity verification, helping both sides make a more informed decision.'],
  ['What is the difference between Verify and Verify Plus?', 'Verify checks a person. Verify Plus checks a person and their bank account.'],
  ['How much do checks cost?', 'Company Check £4.99, Bank Account Check £7.99, Verify £9.99, Property Ownership Check £12.99, Verify Both £14.99, Verify Plus £14.99 and Right to Rent £19.99.'],
  ['What should I not send you?', 'Please never send ID documents, bank details or passwords through the contact form or email.'],
];

const schema = z.object({
  name: z.string().trim().min(1, 'Please enter your name').max(120, 'Name is too long'),
  email: z.string().trim().min(1, 'Please enter your email').email('Please enter a valid email').max(254),
  topic: z.enum(['general', 'order', 'privacy', 'other']),
  message: z.string().trim().min(10, 'Please write at least 10 characters').max(4000, 'Message is too long'),
  website: z.string().max(200).optional(),
});
type Values = z.infer<typeof schema>;

function ContactForm() {
  const send = useSubmitContactMessage();
  const [ref, setRef] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', topic: 'general', message: '', website: '' } });
  const onSubmit = (v: Values) => {
    setFailed(false);
    send.mutate({ data: { name: v.name, email: v.email, topic: v.topic, message: v.message, website: v.website ?? '' } }, {
      onSuccess: (r) => { if (r.accepted) { setRef(r.reference); form.reset(); } else setFailed(true); },
      onError: () => setFailed(true),
    });
  };
  const field = 'h-12 rounded-xl border-input bg-white text-base';
  if (ref) {
    return (
      <div className="rounded-2xl border border-primary/25 bg-white p-8 text-center" role="status" data-testid="state-contact-success">
        <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
        <h3 className="ds-display mt-4 text-2xl font-bold">Message received</h3>
        <p className="mt-2 text-muted-foreground">Your reference is <span className="font-mono font-bold text-foreground" data-testid="text-contact-reference">{ref}</span>. Keep it if you need to follow up.</p>
        <button type="button" onClick={() => setRef(null)} className="mt-6 rounded-lg border border-border px-4 py-2.5 text-sm font-bold hover:bg-secondary">Send another message</button>
      </div>
    );
  }
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8" noValidate data-testid="form-contact">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField control={form.control} name="name" render={({ field: f }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input className={field} autoComplete="name" data-testid="input-contact-name" {...f} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="email" render={({ field: f }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input className={field} type="email" autoComplete="email" data-testid="input-contact-email" {...f} /></FormControl><FormMessage /></FormItem>)} />
        </div>
        <FormField control={form.control} name="topic" render={({ field: f }) => (
          <FormItem><FormLabel>Topic</FormLabel><FormControl>
            <select className="h-12 w-full rounded-xl border border-input bg-white px-3 text-base" data-testid="select-contact-topic" {...f}>
              <option value="general">General question</option><option value="order">A check or order</option><option value="privacy">Privacy</option><option value="other">Something else</option>
            </select></FormControl><FormMessage /></FormItem>)} />
        <FormField control={form.control} name="message" render={({ field: f }) => (<FormItem><FormLabel>Message</FormLabel><FormControl><Textarea rows={6} className="rounded-xl border-input bg-white text-base" data-testid="input-contact-message" {...f} /></FormControl><FormMessage /></FormItem>)} />
        <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
          <label>Website<input type="text" tabIndex={-1} autoComplete="off" {...form.register('website')} /></label>
        </div>
        <p className="rounded-lg bg-secondary px-3.5 py-3 text-sm text-foreground">Please do not include ID documents, bank details or passwords. We store your name, email, topic and message so we can reply.</p>
        {failed ? <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3.5 py-3 text-sm font-semibold text-destructive" data-testid="state-contact-error"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> We could not confirm receipt of your message. Please try again later, and include any reference you already have.</p> : null}
        <button type="submit" disabled={send.isPending} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground hover:brightness-110 disabled:cursor-wait disabled:opacity-70 sm:w-auto" data-testid="button-contact-submit">
          {send.isPending ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Sending...</> : 'Send message'}
        </button>
      </form>
    </Form>
  );
}

export function HelpPage() {
  usePageMeta('Help and FAQs | DepositSafe', 'Answers to common questions about DepositSafe checks, plus a contact form for anything else.');
  return (
    <PublicLayout>
      <PageHead eyebrow="Help and FAQs" title="How can we help?" intro="Quick answers first. If yours is not here, send us a message." />
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <h2 className="ds-display text-2xl font-bold">Common questions</h2>
          <div className="mt-5 divide-y divide-border rounded-2xl border border-border bg-white">
            {faqs.map(([q, a], i) => (
              <details key={q} className="group px-5 py-4" data-testid={`faq-${i}`}>
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-bold">{q}<ChevronDown className="ds-chev h-5 w-5 shrink-0 text-primary transition-transform" /></summary>
                <p className="mt-3 text-base leading-7 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </div>
        <div>
          <h2 className="ds-display text-2xl font-bold">Contact us</h2>
          <p className="mb-5 mt-2 text-muted-foreground">We will reply by email. See our <Link href="/privacy" className="font-bold text-primary underline">privacy page</Link> for what we keep.</p>
          <ContactForm />
        </div>
      </div>
    </PublicLayout>
  );
}
