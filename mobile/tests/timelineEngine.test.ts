import { describe, expect, it } from "vitest";
import { exampleEvents } from "../src/data/examples";
import { createEmptyEvent } from "../src/domain/defaults";
import { generateTimeline } from "../src/domain/timelineEngine";

describe("generateTimeline", () => {
  it("generates ceremony + limonada + cocktail overlaps", () => {
    const event = exampleEvents[0];
    const result = generateTimeline(event);

    expect(result.blocks.some((block) => block.id === "ceremony-service")).toBe(true);
    expect(result.blocks.some((block) => block.id === "limonada-service")).toBe(true);
    expect(result.blocks.some((block) => block.id === "cocktail-previa")).toBe(true);
    expect(result.blocks.some((block) => block.id === "transition-ceremony-cocktail")).toBe(true);
    expect(result.blocks.find((block) => block.id === "cocktail-previa")?.overlapsWith?.length).toBeGreaterThan(0);
  });

  it("generates cocktail + banquet + party chain", () => {
    const event = exampleEvents[0];
    const result = generateTimeline(event);

    expect(result.blocks.some((block) => block.id === "banquet-previa")).toBe(true);
    expect(result.blocks.some((block) => block.id === "party-previa")).toBe(true);
    expect(result.blocks.some((block) => block.id === "party-service-0")).toBe(true);
  });

  it("supports an event without ceremony", () => {
    const event = exampleEvents[1];
    const result = generateTimeline(event);

    expect(result.blocks.some((block) => block.module === "ceremonia")).toBe(false);
    expect(result.blocks.some((block) => block.module === "coctel")).toBe(true);
    expect(result.summary.totalBlocks).toBeGreaterThan(5);
  });

  it("applies >200 pax assumptions and duplicated stands", () => {
    const event = {
      ...createEmptyEvent(),
      pax: 240,
      cocktail: {
        ...createEmptyEvent().cocktail,
        stands: ["jamon_1x50", "quesos_clasico", "croquetas"],
      },
    };
    const result = generateTimeline(event);

    expect(result.summary.has200PaxAdjustments).toBe(true);
    expect(result.assumptions.some((item) => item.id === "more-than-200-pax")).toBe(true);
    expect(result.blocks.filter((block) => block.reference === "P_JA")).toHaveLength(2);
  });

  it("generates all bundled examples with valid durations", () => {
    exampleEvents.forEach((event) => {
      const result = generateTimeline(event);
      expect(result.summary.totalBlocks).toBeGreaterThan(0);
      expect(result.blocks.every((block) => block.durationMinutes > 0)).toBe(true);
    });
  });
});
