import { cn } from '@/lib/utils';

/** Page-content branding: stays in the document flow, never in the sticky header. */
export function PageBrand({ className }: { className?: string }) {
  return (
    <div className={cn('mb-8 max-w-full lg:mb-10', className)} data-testid="page-content-brand">
      <img
        src={`${import.meta.env.BASE_URL}approved-depositsafe-logo.png`}
        alt="DepositSafe"
        width={2172}
        height={724}
        className="block h-auto w-[280px] max-w-full mix-blend-multiply sm:w-[320px] lg:w-[360px]"
      />
    </div>
  );
}