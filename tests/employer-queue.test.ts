import { describe, expect, it } from "vitest";

import { decodeHtmlEntities } from "../lib/job-sources/employer-sources";
import { sourcePriority, SEED_SOURCE, TARGET_SOURCE } from "../lib/job-sources/services/employer-discovery";
import { normalizeCompanyName } from "../lib/job-sources/board-resolution";

describe("HTML entity decoding at ingestion", () => {
  it("decodes the entities observed in real feed data", () => {
    expect(decodeHtmlEntities("NHS Ayrshire &amp; Arran")).toBe("NHS Ayrshire & Arran");
    expect(decodeHtmlEntities("Crown &amp; Pearl")).toBe("Crown & Pearl");
    expect(decodeHtmlEntities("J&amp;D Quality Smash Repairs")).toBe("J&D Quality Smash Repairs");
  });

  it("handles numeric and hex character references", () => {
    expect(decodeHtmlEntities("Ben &#38; Jerry")).toBe("Ben & Jerry");
    expect(decodeHtmlEntities("Caf&#233; Nero")).toBe("Café Nero");
    expect(decodeHtmlEntities("A&#x26;B")).toBe("A&B");
  });

  it("leaves ordinary names and unknown entities untouched", () => {
    expect(decodeHtmlEntities("Plain Name")).toBe("Plain Name");
    expect(decodeHtmlEntities("Tom &notarealentity; Co")).toBe("Tom &notarealentity; Co");
  });

  it("stops the encoded ampersand corrupting the derived slug", () => {
    // "&amp;" previously survived into normalisation as the token "amp".
    expect(normalizeCompanyName("Crown &amp; Pearl")).toContain("amp");
    expect(normalizeCompanyName(decodeHtmlEntities("Crown &amp; Pearl"))).toBe("crown and pearl");
  });
});

describe("curated seed provenance", () => {
  it("puts seeds ahead of every harvested market source", () => {
    for (const market of ["arbeitnow", "himalayas", "remotive", "remoteok", "some-new-source"]) {
      expect(sourcePriority(SEED_SOURCE)).toBeLessThan(sourcePriority(market));
    }
  });

  it("uses an explicit, namespaced provenance value", () => {
    expect(SEED_SOURCE).toBe("seed:ai");
    expect(SEED_SOURCE).not.toBe(TARGET_SOURCE);
  });

  it("keeps targets out of the background queue rather than ranking them against seeds", () => {
    // Targets resolve through their own scoped path, so they are filtered out
    // of `selectBackgroundQueue` entirely and never compete with seeds.
    expect(TARGET_SOURCE).not.toBe(SEED_SOURCE);
  });
});

describe("background queue source priority", () => {
  it("ranks sources by measured first-pass resolution rate", () => {
    // arbeitnow 27.3% / himalayas 26.7% > remotive 11.8% > remoteok 1.2%
    expect(sourcePriority("arbeitnow")).toBe(1);
    expect(sourcePriority("himalayas")).toBe(1);
    expect(sourcePriority("remotive")).toBe(2);
    expect(sourcePriority("remoteok")).toBe(3);
  });

  it("puts every strong source ahead of the weakest one", () => {
    for (const strong of ["arbeitnow", "himalayas", "remotive"]) {
      expect(sourcePriority(strong)).toBeLessThan(sourcePriority("remoteok"));
    }
  });

  it("gives an unknown source a middle band rather than the front or back", () => {
    expect(sourcePriority("some-new-source")).toBe(2);
    expect(sourcePriority("some-new-source")).toBeGreaterThan(sourcePriority("arbeitnow"));
    expect(sourcePriority("some-new-source")).toBeLessThan(sourcePriority("remoteok"));
  });

  it("keeps the target source distinct from background sources", () => {
    // Targets are filtered out of the background queue entirely, not ranked.
    expect(TARGET_SOURCE).toBe("target");
  });
});
