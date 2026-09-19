import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { setLocalePreference } from "../../i18n";
import { runtimeSnapshot, upstreamsSnapshot, upstreamQuality, upstreams } from "../__fixtures__";
import type { TopicSnapshot } from "../../realtime/types";
import type { RuntimeTopic, UpstreamsTopic } from "../../realtime/topics";
import { UpstreamsWidget } from "./UpstreamsWidget";

const feed = vi.hoisted(() => ({ topics: {} as Record<string, unknown> }));
vi.mock("../../realtime", () => ({ useSnapshot: (topic: string) => feed.topics[topic] }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

function fixture(
  stats: UpstreamsTopic["upstreams"],
  quality: RuntimeTopic["upstream_quality"],
  statsStale = false,
  qualityStale = false,
) {
  const snap = <T,>(data: T, stale: boolean): TopicSnapshot<T> => ({
    data,
    ts: 1756000000,
    stale,
    error: null,
  });
  feed.topics = {
    upstreams: snap({ ...upstreamsSnapshot, upstreams: stats }, statsStale),
    runtime: snap({ ...runtimeSnapshot, upstream_quality: quality }, qualityStale),
  };
}
const disabled = {
  ...upstreams,
  enabled: false,
  reason: "feature_disabled",
  summary: undefined,
  upstreams: undefined,
};
afterEach(() => setLocalePreference("ru"));

describe("overview upstream data availability", () => {
  it.each([
    ["disabled", disabled],
    ["missing", null],
    ["unavailable", { ...disabled, enabled: true, reason: "source_unavailable" }],
  ] as const)(
    "uses runtime routes when the stats source is %s",
    (_state, stats) => {
      fixture(stats, upstreamQuality);
      const html = renderToStaticMarkup(<UpstreamsWidget />);
      expect(html).toContain('data-testid="upstreams-card"');
      expect(html).toContain("Direct");
      expect(html).not.toContain("feature_disabled");
      expect(html).not.toContain("Выключено");
    },
  );
  it("does not require runtime quality when stats has routes", () => {
    fixture(upstreams, null);
    expect(renderToStaticMarkup(<UpstreamsWidget />)).toContain('data-testid="upstreams-card"');
  });
  it("prefers fresh runtime routes over cached stats", () => {
    fixture(
      {
        ...upstreams,
        upstreams: upstreams.upstreams!.map((u) => ({ ...u, effective_latency_ms: 999 })),
      },
      {
        ...upstreamQuality,
        upstreams: upstreamQuality.upstreams!.map((u) => ({ ...u, effective_latency_ms: 42 })),
      },
      true,
    );
    const html = renderToStaticMarkup(<UpstreamsWidget />);
    expect(html).toContain("42");
    expect(html).not.toContain("999");
    expect(html).not.toContain("Данные устарели");
  });
  it("marks cached runtime fallback as stale", () => {
    fixture(disabled, upstreamQuality, false, true);
    const html = renderToStaticMarkup(<UpstreamsWidget />);
    expect(html).toContain('data-testid="upstreams-card"');
    expect(html).toContain("Данные устарели");
  });
  it("does not mark fresh stats stale because unused runtime data is stale", () => {
    fixture(upstreams, upstreamQuality, false, true);
    expect(renderToStaticMarkup(<UpstreamsWidget />)).not.toContain("Данные устарели");
  });
  it.each([disabled, { ...disabled, enabled: true, reason: "source_unavailable" }])(
    "reports unavailable observations rather than disabled or empty upstreams",
    (stats) => {
      fixture(stats, {
        ...upstreamQuality,
        enabled: false,
        reason: "source_unavailable",
        summary: undefined,
        upstreams: undefined,
      });
      const html = renderToStaticMarkup(<UpstreamsWidget />);
      expect(html).toContain("Данные об апстримах недоступны");
      expect(html).not.toContain("Выключено");
      expect(html).not.toContain('data-testid="upstreams-card"');
    },
  );
});
