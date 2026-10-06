import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ExternalLink, LoaderCircle, ShieldCheck, X } from 'lucide-react';

const REFRESH_INTERVAL_MS = 12_000;

/** Mirrors the server's rule: only an HTTPS page on the Credas domain is ever framed. */
export function trustedJourneyUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    const trusted = url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      /\.credas(?:demo)?\.com$/i.test(url.hostname);
    return trusted ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Shows the participant's Credas journey inside DepositSafe. The link signs that person in,
 * so it is held in memory only, never sent to the provider as a referrer, and the frame
 * cannot navigate this page.
 */
export function CredasJourneyFrame({
  url,
  open,
  onClose,
  onProgress,
}: {
  url: string;
  open: boolean;
  onClose: () => void;
  /** Asks the server to re-read the check from the provider; never trusts the frame. */
  onProgress: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const [loaded, setLoaded] = useState(false);
  const journey = trustedJourneyUrl(url);

  useEffect(() => {
    if (!open || !journey) return;
    setLoaded(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') progressRef.current();
    }, REFRESH_INTERVAL_MS);
    // A message from the journey is only a prompt to ask the server; its content is ignored.
    const onMessage = (event: MessageEvent) => {
      if (event.origin === journey.origin && event.source === frameRef.current?.contentWindow) progressRef.current();
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('message', onMessage);
    };
  }, [open, journey?.href]);

  if (!journey) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content
          // Leaving part-way should be a deliberate choice, not a stray click outside.
          onInteractOutside={(event) => event.preventDefault()}
          aria-describedby={undefined}
          className="ds-customer fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none sm:inset-x-auto sm:left-1/2 sm:top-[4dvh] sm:h-[92dvh] sm:w-[min(56rem,94vw)] sm:-translate-x-1/2 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl"
          data-testid="dialog-credas-journey"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></span>
              <div className="min-w-0">
                <Dialog.Title className="truncate text-sm font-extrabold">Your identity verification</Dialog.Title>
                <p className="truncate text-[.7rem] text-muted-foreground">Secure session with our verification partner. Have your ID ready and allow camera access when asked.</p>
              </div>
            </div>
            <Dialog.Close className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted" aria-label="Close verification" data-testid="button-credas-journey-close">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="relative min-h-0 flex-1 bg-white">
            {!loaded ? <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground" role="status"><LoaderCircle className="h-4 w-4 animate-spin" /> Opening your verification…</p> : null}
            <iframe
              ref={frameRef}
              src={journey.href}
              title="Identity verification"
              onLoad={() => setLoaded(true)}
              // Camera and microphone are delegated to the journey's own origin only.
              allow="camera; microphone; fullscreen"
              // No allow-top-navigation: the journey can never move this page elsewhere.
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              className="relative h-full w-full border-0"
              data-testid="frame-credas-journey"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-[.7rem] text-muted-foreground">
            <span>Your progress is saved. This page updates when your verification is complete.</span>
            <a href={journey.href} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex items-center gap-1.5 font-bold text-primary underline" data-testid="link-credas-journey-new-tab">
              Camera not working? Open in a new tab <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
