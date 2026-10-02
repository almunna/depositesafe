import { useEffect, useState } from 'react';
import { ArrowRight, CircleAlert, Clock3, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  type Transaction,
  useCreateStripeCheckoutSession,
} from '@workspace/api-client-react';

export type PaymentReturnState = 'success' | 'cancel' | 'checkout-error' | null;

export function checkoutIdempotencyKey(reference: string) {
  if (typeof window === 'undefined') throw new Error('Checkout is only available in a browser.');
  const keyName = `depositsafe:checkout-idempotency:${reference}`;
  const existing = window.sessionStorage.getItem(keyName);
  if (existing) return existing;
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const key = `depositsafe-${randomId}`;
  window.sessionStorage.setItem(keyName, key);
  return key;
}

export function checkoutErrorStorageKey(reference: string) {
  return `depositsafe:checkout-error:${reference}`;
}

export function getCheckoutReturnUrl(reference: string, result: 'success' | 'cancel') {
  const basePath = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const path = `${basePath}transactions/${encodeURIComponent(reference)}`;
  const url = new URL(path, window.location.origin);
  url.searchParams.set('payment', result);
  return url.toString();
}

export function secureCheckoutUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('The secure checkout link was not valid. Please try again.');
  return url.toString();
}

function messageFromError(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'We could not start secure checkout. Please try again.';
}

function isConfirmedPaid(status: Transaction['status']) {
  return !['STARTED', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'EXPIRED'].includes(status);
}

function isWaitingForPayment(status: Transaction['status']) {
  return status === 'STARTED' || status === 'PAYMENT_PENDING';
}

function readStoredCheckoutError(reference: string) {
  try {
    return window.sessionStorage.getItem(checkoutErrorStorageKey(reference)) ?? '';
  } catch {
    return '';
  }
}

export function PaymentPanel({
  transaction,
  returnState,
  onRefresh,
}: {
  transaction: Transaction;
  returnState: PaymentReturnState;
  onRefresh: () => Promise<boolean>;
}) {
  const checkout = useCreateStripeCheckoutSession();
  const [requestError, setRequestError] = useState(() => returnState === 'checkout-error' ? readStoredCheckoutError(transaction.reference) : '');
  const [refreshError, setRefreshError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const paid = isConfirmedPaid(transaction.status);
  const isCompanyCheck = transaction.product.slug === 'company-check';
  const canResume = ['STARTED', 'PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(transaction.status);

  useEffect(() => {
    if (returnState !== 'success' || !isWaitingForPayment(transaction.status)) return;
    let mounted = true;
    const refresh = async () => {
      const ok = await onRefresh();
      if (mounted) setRefreshError(ok ? '' : 'We could not refresh payment status. We will keep checking.');
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [returnState, transaction.status, onRefresh]);

  const refreshStatus = async () => {
    setIsRefreshing(true);
    const ok = await onRefresh();
    setRefreshError(ok ? '' : 'We could not refresh payment status. Please try again.');
    setIsRefreshing(false);
  };

  const resumeCheckout = async () => {
    setRequestError('');
    setRefreshError('');
    try {
      const idempotencyKey = checkoutIdempotencyKey(transaction.reference);
      const response = await checkout.mutateAsync({
        reference: transaction.reference,
        data: {
          idempotencyKey,
          successUrl: getCheckoutReturnUrl(transaction.reference, 'success'),
          cancelUrl: getCheckoutReturnUrl(transaction.reference, 'cancel'),
        },
      });
      if (response.paymentStatus === 'failed') {
        throw new Error('The payment provider could not create a checkout session. Please try again.');
      }
      if (!response.checkoutSessionReference || !Number.isFinite(response.amountPence) || response.amountPence < 0) {
        throw new Error('The checkout response was incomplete. Please try again.');
      }
      const url = secureCheckoutUrl(response.checkoutUrl);
      try {
        window.sessionStorage.removeItem(checkoutErrorStorageKey(transaction.reference));
      } catch {
        // The checkout itself can continue if optional error storage is unavailable.
      }
      window.location.assign(url);
    } catch (error) {
      setRequestError(messageFromError(error));
    }
  };

  if (paid && !returnState) return null;

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/[.035] p-5 sm:p-6" data-testid="panel-payment">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          {paid ? <ShieldCheck className="h-4 w-4" /> : returnState === 'success' ? <Clock3 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-primary">Secure payment</p>
          {paid ? (
            <>
              <h2 className="mt-2 text-base font-extrabold">Payment confirmed</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{isCompanyCheck ? ['VERIFICATION_COMPLETED', 'RESULT_GENERATED', 'DELIVERED'].includes(transaction.status) ? 'Your £4.99 payment is confirmed. Your saved Company Check is ready to review below.' : 'Your £4.99 payment is confirmed. Continue with your Company Check below.' : 'DepositSafe has recorded payment for this transaction.'}</p>
            </>
          ) : returnState === 'success' ? (
            <>
              <h2 className="mt-2 text-base font-extrabold">
                {transaction.status === 'PAYMENT_FAILED' ? 'Payment not confirmed' : transaction.status === 'EXPIRED' ? 'This transaction has expired' : 'Confirming your payment'}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {transaction.status === 'PAYMENT_FAILED'
                  ? 'The transaction has not been marked paid. You can try checkout again if this record is still active.'
                  : transaction.status === 'EXPIRED'
                    ? 'This transaction has expired and cannot accept another checkout.'
                     : isCompanyCheck ? 'We’re waiting for your secure payment confirmation. This page will update automatically.' : 'Returning from checkout is not proof of payment. We are checking for the payment confirmation from Stripe.'}
              </p>
            </>
          ) : returnState === 'cancel' ? (
            <>
              <h2 className="mt-2 text-base font-extrabold">Checkout incomplete</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{isCompanyCheck ? 'Your check is ready to continue whenever you are. If you’ve already paid, your payment confirmation will appear here shortly.' : 'DepositSafe has not confirmed a payment. Leaving checkout does not mark this transaction as paid; if you completed payment before returning, this record will update after confirmation.'}</p>
            </>
          ) : (
            <>
              <h2 className="mt-2 text-base font-extrabold">Complete payment to continue</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{isCompanyCheck ? 'Your Company Check reference is saved. Pay £4.99 securely to choose and check a company.' : 'Your transaction reference is saved. Continue to Stripe’s secure hosted checkout when you are ready.'}</p>
            </>
          )}
        </div>
      </div>

      {requestError ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs font-semibold leading-5 text-destructive" data-testid="text-checkout-error">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {requestError}
        </p>
      ) : null}
      {refreshError ? <p className="mt-3 text-xs font-semibold text-destructive" role="status" data-testid="text-payment-refresh-error">{refreshError}</p> : null}

      {returnState === 'success' && !paid && isWaitingForPayment(transaction.status) ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground" data-testid="status-payment-checking"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Checking with Stripe…</span>
          <button type="button" onClick={() => void refreshStatus()} disabled={isRefreshing} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-60" data-testid="button-refresh-payment">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh status
          </button>
        </div>
      ) : null}

      {canResume && !paid ? (
        <button type="button" onClick={() => void resumeCheckout()} disabled={checkout.isPending} className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70 sm:w-auto" data-testid="button-resume-payment">
          {checkout.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {checkout.isPending ? 'Opening secure checkout…' : 'Continue to secure checkout'}
        </button>
      ) : null}
    </section>
  );
}