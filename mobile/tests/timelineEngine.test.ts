import { describe, expect, it } from "vitest";
import { fallbackEventCatalog } from "../src/data/catalog";
import { exampleEvents } from "../src/data/examples";
import { applyOperationalSchedule, banquetSegmentMinutes, createEmptyEvent, normalizeEventConfig } from "../src/domain/defaults";
import { isHHMM } from "../src/domain/time";
import { generateTimeline } from "../src/domain/timelineEngine";

describe("event catalog", () => {
  it("loads the CSV-derived block/task catalog", () => {
    expect(fallbackEventCatalog.blocks).toHaveLength(59);
    expect(fallbackEventCatalog.tasks).toHaveLength(666);
    expect(fallbackEventCatalog.tasks.every((task) => Boolean(task.blockId))).toBe(true);
    expect(fallbackEventCatalog.validation?.tasksWithoutBlock).toBe(0);
  });

  it("maps task staffing and >200 pax adjustments", () => {
    const limonada = fallbackEventCatalog.blocks.find((block) => block.blockId === "B03a");
    const affectedTask = fallbackEventCatalog.tasks.find((task) => task.taskCode === "P_LIM_7");

    expect(limonada?.staffMin).toBe(4);
    expect(limonada?.numTareasCamareros).toBe(20);
    expect(affectedTask?.over200Affected).toBe(true);
    expect(affectedTask?.blockId).toBe("B03a");
  });
});

describe("generateTimeline", () => {
  it("recalculates the full event from a single initial time", () => {
    const event = applyOperationalSchedule({
      ...createEmptyEvent(),
      openDoorsTime: "12:15",
    });

    expect(event.ceremony.start).toBe("13:00");
    expect(event.cocktail.start).toBe("14:00");
    expect(event.banquet.start).toBe("15:15");
    expect(event.party.segments[0]?.start).toBe("18:00");
    expect(event.resopon.serviceWindow?.[0]).toBe("22:40");
    expect(isHHMM(event.openDoorsTime)).toBe(true);
  });

  it("generates ceremony + limonada + cocktail overlaps", () => {
    const event = exampleEvents[0];
    const result = generateTimeline(event);

    expect(result.blocks.some((block) => block.id === "ceremony-service")).toBe(true);
    expect(result.blocks.some((block) => block.id === "limonada-service")).toBe(true);
    expect(result.blocks.some((block) => block.id === "cocktail-previa")).toBe(true);
    expect(result.blocks.some((block) => block.id === "stand-P_JA-cocktail-1-previa")).toBe(true);
    expect(result.blocks.some((block) => block.id === "stand-P_JA-cocktail-1-service")).toBe(true);
    expect(result.blocks.some((block) => block.id === "transition-ceremony-cocktail")).toBe(true);
    expect(result.blocks.find((block) => block.id === "cocktail-previa")?.overlapsWith?.length).toBeGreaterThan(0);
  });

  it("matches the TORRE sample overlap pattern", () => {
    const result = generateTimeline(exampleEvents[0], fallbackEventCatalog);

    expect(result.blocks.find((block) => block.id === "cocktail-previa")?.start).toBe("13:00");
    expect(result.blocks.find((block) => block.id === "banquet-previa")?.start).toBe("14:00");
    expect(result.blocks.find((block) => block.id === "party-previa")?.start).toBe("16:30");
    expect(result.blocks.find((block) => block.id === "resopon-previa")?.start).toBe("21:30");
    expect(result.blocks.find((block) => block.id === "resopon-service")?.start).toBe("21:45");
    expect(result.blocks.find((block) => block.id === "limonada-previa")?.staffMin).toBe(4);
  });

  it("generates cocktail + banquet + party chain", () => {
    const event = exampleEvents[2];
    const result = generateTimeline(event);

    expect(result.blocks.some((block) => block.id === "banquet-previa")).toBe(true);
    expect(result.blocks.some((block) => block.id === "party-previa")).toBe(true);
    expect(result.blocks.some((block) => block.id === "party-service-0")).toBe(true);
    expect(result.blocks.find((block) => block.id === "transition-banquet-party")?.start).toBe("17:15");
    expect(result.blocks.find((block) => block.id === "transition-banquet-party")?.end).toBe("17:50");
    expect(result.blocks.find((block) => block.id === "party-service-0")?.start).toBe("17:50");
    expect(result.blocks.find((block) => block.id === "party-service-0")?.end).toBe("19:30");
    expect(result.blocks.find((block) => block.id === "party-service-1")?.start).toBe("19:30");
    expect(result.blocks.find((block) => block.id === "party-service-1")?.end).toBe("00:00");
    expect(result.blocks.find((block) => block.id === "resopon-service")?.start).toBe("22:30");
    expect(result.assumptions.some((item) => item.id === "banquet-duration-gap")).toBe(true);
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
    expect(result.blocks.filter((block) => block.reference === "P_JA")).toHaveLength(4);
  });

  it("moves stands to ceremony and party according to their selected moment", () => {
    const event = applyOperationalSchedule({
      ...createEmptyEvent(),
      stands: [
        { id: "jamon_1x50", enabled: false, moment: "cocktail" },
        { id: "quesos_clasico", enabled: false, moment: "cocktail" },
        { id: "croquetas", enabled: true, moment: "party" },
        { id: "cerveza", enabled: true, moment: "ceremony" },
      ],
    });
    const result = generateTimeline(event);

    expect(result.blocks.find((block) => block.id === "stand-P_CE-ceremony-1-previa")?.start).toBe("12:15");
    expect(result.blocks.find((block) => block.id === "stand-P_CE-ceremony-1-service")?.start).toBe("13:00");
    expect(result.blocks.find((block) => block.id === "stand-P_CR-party-1-previa")?.start).toBe("17:15");
    expect(result.blocks.find((block) => block.id === "stand-P_CR-party-1-previa")?.end).toBe(
      event.party.segments[0]?.start,
    );
    expect(result.blocks.find((block) => block.id === "stand-P_CR-party-1-service")?.end).toBe(
      event.party.segments[event.party.segments.length - 1]?.end,
    );
  });

  it("derives banquet segment durations from pax", () => {
    const small = normalizeEventConfig({ ...createEmptyEvent(), pax: 145 });
    const large = normalizeEventConfig({ ...createEmptyEvent(), pax: 240 });

    expect(banquetSegmentMinutes(145)).toBe(30);
    expect(banquetSegmentMinutes(240)).toBe(45);
    expect(small.banquet.segments.every((segment) => segment.minutes === 30)).toBe(true);
    expect(large.banquet.segments.every((segment) => segment.minutes === 45)).toBe(true);
  });

  it("normalizes legacy cocktail stands and ceremony beer stand", () => {
    const legacy = normalizeEventConfig({
      ...createEmptyEvent(),
      stands: undefined as never,
      ceremony: { ...createEmptyEvent().ceremony, beerStand: true },
      cocktail: { ...createEmptyEvent().cocktail, stands: ["croquetas"] },
    });

    expect(legacy.stands.find((stand) => stand.id === "cerveza")).toMatchObject({
      enabled: true,
      moment: "ceremony",
    });
    expect(legacy.stands.find((stand) => stand.id === "croquetas")).toMatchObject({
      enabled: true,
      moment: "cocktail",
    });
  });

  it("generates all bundled examples with valid durations", () => {
    exampleEvents.forEach((event) => {
      const result = generateTimeline(event);
      expect(result.summary.totalBlocks).toBeGreaterThan(0);
      expect(result.blocks.every((block) => block.durationMinutes > 0)).toBe(true);
    });
  });
});
