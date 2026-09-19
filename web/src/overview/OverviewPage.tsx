import { useStrings } from "../i18n";
import { PageHeader } from "../ui/PageHeader";
import { HealthHero } from "../pulse/widgets/HealthHero";
import { StatRow } from "../pulse/widgets/StatRow";
import { Problems } from "../pulse/widgets/Problems";
import { DcWidget } from "../pulse/widgets/DcWidget";
import { MePoolWidget } from "../pulse/widgets/MePoolWidget";
import { UpstreamsWidget } from "../pulse/widgets/UpstreamsWidget";
import { OnlineNow } from "../pulse/widgets/OnlineNow";
import { RecentEventsWidget } from "../pulse/widgets/RecentEventsWidget";
import { QuotasWidget } from "../pulse/widgets/QuotasWidget";

// Overview is deliberately fixed. An operator console benefits from stable
// positions and muscle memory; a linear user-defined list could not preserve
// the pairs and proportions of this layout, and allowed critical
// operational sections to be hidden altogether.
export function OverviewPage() {
  const s = useStrings();
  return (
    <div className="w-full">
      <PageHeader title={s.overview.title} />
      <div className="flex flex-col gap-4 lg:gap-5">

        <HealthHero />
        <StatRow />

        {/* The operator workspace has one primary scan column and a dedicated
            event rail. Below xl the rail rejoins the content so tablet and
            phone widths never squeeze operational cards into empty slivers. */}
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_clamp(300px,23vw,400px)] xl:gap-5">
          <div className="flex min-w-0 flex-col gap-4 xl:gap-5">
            <Problems />
            <DcWidget />

            <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 md:grid-cols-2 min-[120rem]:grid-cols-3 xl:gap-5 [&>*]:h-full" data-testid="overview-support-grid">
              <MePoolWidget />
              <UpstreamsWidget />
              <div className="min-w-0 xl:col-span-2 min-[120rem]:col-span-1 [&>*]:h-full"><OnlineNow /></div>
              <div className="xl:hidden">
                <RecentEventsWidget />
              </div>
            </div>

            {/* QuotasWidget removes itself in the normal state. */}
            <QuotasWidget />
          </div>

          <aside
            aria-label={s.pulse.widgets.recent_events}
            className="hidden min-w-0 xl:block"
            data-testid="overview-event-rail"
          >
            <div className="sticky top-5">
              <RecentEventsWidget rail />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
