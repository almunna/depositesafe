import { ArrowLeft, FileQuestion } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-5">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><FileQuestion className="h-6 w-6" /></div>
        <p className="eyebrow mt-7 text-primary">Reference not found</p>
        <h1 className="mt-3 font-display text-5xl tracking-[-.04em]">That page moved.</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">The address is not part of the DepositSafe record. Return to the directory and choose a current route.</p>
        <Link href="/" className="focus-ring mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground" data-testid="link-not-found-home"><ArrowLeft className="h-4 w-4" /> Back to DepositSafe</Link>
      </div>
    </div>
  );
}
