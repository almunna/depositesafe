import { AlertCircle, Check, LoaderCircle } from 'lucide-react';
import type { TransactionStatus } from '@workspace/api-client-react';

const stages = [
  { title: 'Check started', detail: 'Your Company Check reference is ready.' },
  { title: 'Payment confirmed', detail: 'Your £4.99 payment has been received.' },
  { title: 'Company details checked', detail: 'The selected company’s details have been retrieved from Companies House.' },
  { title: 'Result saved', detail: 'Your Company Check result is saved here for you to review.' },
] as const;

export function companyCheckProgress(status: TransactionStatus) {
  const completed = ['VERIFICATION_COMPLETED', 'RESULT_GENERATED', 'DELIVERED'].includes(status);
  const paid = completed || ['PAID', 'VERIFICATION_PENDING', 'VERIFICATION_IN_PROGRESS', 'VERIFICATION_FAILED', 'MANUAL_ATTENTION'].includes(status);
  return {
    reached: completed ? 3 : paid ? 1 : 0,
    inProgress: status === 'VERIFICATION_IN_PROGRESS',
    attention: ['VERIFICATION_FAILED', 'MANUAL_ATTENTION', 'PAYMENT_FAILED', 'EXPIRED'].includes(status),
  };
}

export function CompanyCheckProgress({ status }: { status: TransactionStatus }) {
  const progress = companyCheckProgress(status);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" data-testid="panel-company-progress">
      <p className="eyebrow text-primary">Your Company Check</p>
      <h2 className="mt-2 font-display text-3xl">Your progress</h2>
      <ol className="mt-7">
        {stages.map((stage, index) => {
          const reached = index <= progress.reached;
          const checking = index === 2 && progress.inProgress;
          return (
            <li key={stage.title} className="flex gap-4" aria-current={checking || index === progress.reached ? 'step' : undefined}>
              <div className="flex flex-col items-center">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${reached || checking ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted text-muted-foreground'}`}>
                  {reached ? <Check className="h-4 w-4" /> : checking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <span className="text-xs font-bold">{index + 1}</span>}
                </span>
                {index < stages.length - 1 ? <span className={`min-h-12 flex-1 w-px ${index < progress.reached ? 'bg-primary' : 'bg-border'}`} /> : null}
              </div>
              <div className="pb-7 pt-1">
                <p className={`text-sm font-bold ${reached || checking ? 'text-foreground' : 'text-muted-foreground'}`}>{checking ? 'Checking company details…' : stage.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{reached ? stage.detail : checking ? 'We’re retrieving the latest public-register details.' : index === 1 ? 'Complete secure checkout to continue.' : index === 2 ? 'Choose a company and run your check.' : 'Your result will appear here when the check is complete.'}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {progress.attention ? (
        <div role="alert" className="flex gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm" data-testid="text-company-progress-attention">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div><p className="font-bold">Your check needs attention</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{status === 'PAYMENT_FAILED' ? 'Payment could not be confirmed. Use the payment options on this page to try again.' : status === 'EXPIRED' ? 'This check has expired. Contact DepositSafe if you need help.' : 'Your result is not ready yet. Review the message below, or contact DepositSafe with your check reference.'}</p></div>
        </div>
      ) : null}
    </section>
  );
}