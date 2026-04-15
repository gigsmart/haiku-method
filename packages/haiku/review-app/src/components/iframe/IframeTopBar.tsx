import { HostBridgeStatus, type BridgeStatus } from "./HostBridgeStatus";

interface Props {
  slug?: string;
  sessionType?: string;
  bridgeStatus: BridgeStatus;
  onRetry?: () => void;
}

/**
 * 36px top status strip shown only in MCP Apps iframe mode.
 * Replaces the browser-mode header.
 */
export function IframeTopBar({ slug, sessionType, bridgeStatus, onRetry }: Props) {
  return (
    <div
      className="sticky top-0 z-40 h-9 min-h-[36px] flex items-center justify-between px-3 bg-stone-900 border-b border-stone-800 shrink-0"
      role="banner"
    >
      <div className="flex items-center gap-2 min-w-0">
        {slug && (
          <span className="text-xs text-stone-400 truncate max-w-[120px]" aria-label={`Intent: ${slug}`}>
            {slug}
          </span>
        )}
        {slug && sessionType && (
          <span className="text-stone-700 text-xs" aria-hidden="true">·</span>
        )}
        {sessionType && (
          <span className="text-xs text-stone-500 capitalize">{sessionType}</span>
        )}
      </div>
      <HostBridgeStatus status={bridgeStatus} onRetry={onRetry} />
    </div>
  );
}
