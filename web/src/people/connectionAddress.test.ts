import { describe, expect, it } from "vitest";
import {
  collectConnectionLinks,
  connectionAddressDomains,
  formatConnectionLink,
  withConnectionAddress,
} from "./connectionLinks";

const secret = "0123456789abcdef0123456789abcdef";
const tlsSecret = `ee${secret}6d61736b2e6578616d706c65`;
const wire = {
  classic: [`tg://proxy?server=rr.example&port=8443&secret=${secret}`],
  secure: [`tg://proxy?server=rr.example&port=8443&secret=dd${secret}`],
  tls: [`tg://proxy?server=rr.example&port=8443&secret=${tlsSecret}&comment=Alice%20phone`],
  tls_domains: [],
};

describe("explicit Access-only link address override", () => {
  it("reads only configured extra TLS domains, normalizes and deduplicates them", () => {
    expect(
      connectionAddressDomains({
        censorship: {
          tls_domain: "mask.example",
          tls_domains: [
            " node.example ",
            "NODE.example",
            "other.example",
            "bücher.example",
            "*.example",
            "https://evil.example",
            "evil.example/path",
            "evil.example:443",
            "user@evil.example",
            "evil.example?secret=x",
            "%65vil.example",
            "bad domain",
            "",
            null,
            123,
          ],
        },
      }),
    ).toEqual(["node.example", "other.example", "xn--bcher-kva.example"]);
    expect(connectionAddressDomains(undefined)).toEqual([]);
    expect(connectionAddressDomains({ censorship: null })).toEqual([]);
  });
  it.each(["tls", "secure", "classic"] as const)(
    "changes only the server query value in %s links",
    (kind) => {
      const original = collectConnectionLinks(wire).find((l) => l.kind === kind)!;
      const modified = withConnectionAddress(original, "node.example");
      const before = new URL(original.url),
        after = new URL(modified.url);
      expect(after.searchParams.get("server")).toBe("node.example");
      after.searchParams.set("server", before.searchParams.get("server")!);
      expect(after.toString()).toBe(before.toString());
      expect(modified.domain).toBe(original.domain);
      expect(modified.endpoint).toBe("node.example:8443");
      expect(new URL(formatConnectionLink(modified, "tme")).searchParams.get("server")).toBe(
        "node.example",
      );
      expect(new URL(original.url).searchParams.get("server")).toBe("rr.example");
    },
  );
  it("never overrides WEB or an invalid/empty domain", () => {
    const links = collectConnectionLinks(wire, [{ host: "web.example", mode: "dd" }]);
    const web = links.find((l) => l.kind === "web")!;
    expect(withConnectionAddress(web, "node.example")).toEqual(web);
    for (const host of [
      "",
      "evil.example:443",
      "user@evil.example",
      "evil.example&secret=x",
      "*.example",
    ]) {
      expect(withConnectionAddress(links[0]!, host)).toEqual(links[0]);
    }
  });
});
