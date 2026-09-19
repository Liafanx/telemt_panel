import { useStrings } from "../../i18n";
import { IconChevronLeft } from "../../ui/icons";
import { PageHeader } from "../../ui/PageHeader";
import { StatePill, type State } from "../../ui/StatePill";
import { formatRelativeAge } from "../formatting";
import type { SourceStatus } from "../sourceState";
import { sourceStatusLabel, sourceStatusShortLabel } from "../sourceState";

// STATUS_TONE maps §14's eight page states onto the app's ONE status
// vocabulary (ui/StatePill: ok/warn/error/muted — 06-ui.md deliberately
// keeps a single one). `disabled` and `unsupported` are muted, not warnings:
// a switched-off capability is information, not an alarm (the same choice
// pulse/GatedNote makes).
const STATUS_TONE: Record<SourceStatus, State> = {
  loading: "muted",
  ready: "ok",
  stale: "warn",
  partial: "warn",
  disabled: "muted",
  unsupported: "muted",
  error: "error",
  empty: "muted",
};

export interface DetailHeaderProps {
  title: string;
  /** The page's lede — hidden in compact landscape (§15.3). */
  description?: string;
  /** Parent section label for the back affordance. */
  backLabel?: string;
  /**
   * §15.3's compressed header: on a phone in landscape the whole viewport
   * is 390 px tall, so the lede is dropped. Nothing that carries STATE goes away — the
   * age, the status pill and the back affordance stay.
   */
  compact?: boolean;
  status: SourceStatus;
  statusLabel?:string;
  /** Normalized epoch ms of the payload on screen (sourceState.ts). */
  freshnessMs: number | null;
  /** One clock for the whole page. */
  nowMs: number;
  onBack?: () => void;
}

// DetailHeader is §6's header node: back navigation, title/context, a
// freshness indicator that shows the AGE (not just a timestamp — §19.3) and
// the page-level status. The age carries the absolute stamp as its title,
// so the exact moment stays reachable without a second line of chrome.
export function DetailHeader({
  title,
  description,
  backLabel,
  compact = false,
  status,
  statusLabel,
  freshnessMs,
  nowMs,
  onBack,
}: DetailHeaderProps) {
  const s = useStrings();
  const age = freshnessMs === null ? null : formatRelativeAge(freshnessMs, s, nowMs);

  return (
    <PageHeader
      title={title}
      description={description}
      compact={compact}
      back={onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={`${s.details.page.back}: ${backLabel ?? s.pulse.title}`}
        >
          <IconChevronLeft aria-hidden="true" />
          {backLabel ?? s.pulse.title}
        </button>
      )}
      meta={<>
          {age && (
            <span className="text-meta tabular-nums text-text-muted" title={age.title}>
              {s.details.freshness.updated} {age.text}
            </span>
          )}
          <StatePill state={STATUS_TONE[status]} title={statusLabel??sourceStatusLabel(status, s)}>
            {statusLabel??sourceStatusShortLabel(status, s)}
          </StatePill>
      </>}
    />
  );
}
