interface Props {
  hostVersion: string;
  expectedVersion: string;
  onDismiss: () => void;
}

/**
 * Non-blocking stale-host protocol version warning.
 * Shown when the host advertises an older protocol than the SPA expects.
 * The review session continues to load normally — this is a soft warning.
 */
export function StaleHostWarning({ hostVersion, expectedVersion, onDismiss }: Props) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="flex items-center gap-3 px-3 py-2 bg-amber-950/40 border-b border-amber-800/60 text-sm"
    >
      <span className="text-amber-400 text-xs shrink-0" aria-hidden="true">⚠</span>
      <span className="flex-1 text-amber-300 text-xs leading-snug">
        Host protocol v{hostVersion} is older than expected v{expectedVersion}.{" "}
        <code className="font-mono text-amber-400">STALE_HOST_PROTOCOL</code>
        {" "}— some features may not work correctly.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss stale host warning"
        className="shrink-0 min-h-[44px] min-w-[44px] px-2 text-amber-400 hover:text-amber-200 transition-colors text-xs"
      >
        Dismiss
      </button>
    </div>
  );
}
