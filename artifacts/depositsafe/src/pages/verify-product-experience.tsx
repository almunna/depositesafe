import { useRef, useState } from 'react';
import { getGetProductQueryKey, useGetProduct } from '@workspace/api-client-react';
import { QueryError, SkeletonRows, TransactionForm } from '@/components/depositsafe';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VerifyProductPage } from './verify-product-page';

export function VerifyProductExperience() {
  const [open, setOpen] = useState(false);
  const startButton = useRef<HTMLElement | null>(null);
  const product = useGetProduct('verify', {
    query: {
      queryKey: getGetProductQueryKey('verify'),
      enabled: open,
      retry: false,
    },
  });

  const start = () => {
    startButton.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  };

  return (
    <>
      <VerifyProductPage onStart={start} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="ds-public w-[calc(100%-2rem)] max-w-lg rounded-2xl border-border p-6 sm:p-8"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (startButton.current?.isConnected) startButton.current.focus();
          }}
          data-testid="dialog-start-verify"
        >
          <DialogHeader className="pr-6 text-left">
            <DialogTitle className="ds-display text-2xl font-bold">Start Verify</DialogTitle>
            <DialogDescription className="pt-2 leading-6">
              Start a check for yourself or for the person you want to verify.
            </DialogDescription>
          </DialogHeader>
          <div aria-busy={product.isFetching}>
            {product.isLoading || (product.isFetching && !product.data) ? (
              <div role="status" aria-label="Loading the Verify start form">
                <SkeletonRows count={2} />
              </div>
            ) : product.isError || !product.data ? (
              <QueryError message="We could not load the Verify start form." onRetry={() => void product.refetch()} />
            ) : (
              <TransactionForm product={product.data} />
            )}
          </div>
          <DialogClose asChild>
            <button type="button" className="focus-ring min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary">
              Back to Verify
            </button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}