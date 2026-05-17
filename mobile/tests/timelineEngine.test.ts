import { describe, expect, it } from "vitest";
import { fallbackEventCatalog } from "../src/data/catalog";
import { exampleEvents } from "../src/data/examples";
import {
  DEFAULT_STANDS,
  applyOperationalSchedule,
  banquetSegmentMinutes,
  createEmptyEvent,
  normalizeEventConfig,
} from "../src/domain/defaults";
import { isHHMM } from "../src/domain/time";
import { generateTimeline } from "../src/domain/timelineEngine";

describe("event catalog", () => {
  it("loads the CSV-derived block/task catalog", () => {
    expect(fallbackEventCatalog.blocks).toHaveLength(65);
    expect(fallbackEventCatalog.tasks).toHaveLength(672);
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

  it("adds assignable service blocks for stands that only had setup blocks", () => {
    const serviceRefs = ["P_HU", "P_JA", "P_JA_2j", "P_NA-ZA", "P_QU_C", "P_QU-EM"];

    serviceRefs.forEach((ref) => {
      const serviceBlock = fallbackEventCatalog.blocks.find(
        (block) => block.references === ref && block.moments === "servicio",
      );
      expect(serviceBlock?.taskCodes).toHaveLength(1);
      expect(serviceBlock?.staffMin).toBe(1);

      const serviceTask = fallbackEventCatalog.tasks.find((task) => task.blockId === serviceBlock?.blockId);
      expect(serviceTask).toMatchObject({
        referencia: ref,
        momento: "servicio",
        responsable: "CAMAREROS",
        taskName: "Atencion puesto",
      });
    });
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

  it("uses configured cocktail hours for cocktail service blocks", () => {
    const event = applyOperationalSchedule({
      ...createEmptyEvent(),
      cocktail: {
        ...createEmptyEvent().cocktail,
        totalMinutes: 90,
      },
    });
    const result = generateTimeline(event);

    expect(event.cocktail.end).toBe("15:30");
    expect(event.banquet.start).toBe("15:45");
    expect(result.blocks.find((block) => block.id === "cocktail-service-comida")).toMatchObject({
      start: "14:00",
      end: "15:30",
      durationMinutes: 90,
    });
    expect(result.blocks.find((block) => block.id === "stand-P_JA-cocktail-1-service")).toMatchObject({
      start: "14:00",
      end: "15:30",
      durationMinutes: 90,
    });
  });

  it("uses the average of catalog minimum and maximum duration for block ranges", () => {
    const event = applyOperationalSchedule({
      ...createEmptyEvent(),
      openDoorsTime: "12:15",
    });
    const catalog = {
      ...fallbackEventCatalog,
      blocks: fallbackEventCatalog.blocks.map((block) =>
        block.blockId === "B17"
          ? { ...block, duracionMinima: 20, duracionMax: 40, duracionReferenciaMin: 125 }
          : block,
      ),
    };
    const result = generateTimeline(event, catalog);

    expect(result.blocks.find((block) => block.id === "cocktail-previa")).toMatchObject({
      start: "11:45",
      end: "12:15",
      durationMinutes: 30,
    });
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

    expect(result.blocks.find((block) => block.id === "ceremony-previa")).toMatchObject({
      start: "11:25",
      end: "12:15",
      durationMinutes: 50,
    });
    expect(result.blocks.find((block) => block.id === "limonada-previa")).toMatchObject({
      start: "11:37",
      end: "12:15",
      durationMinutes: 38,
    });
    expect(result.blocks.find((block) => block.id === "briefing")).toMatchObject({
      start: "12:00",
      end: "12:15",
      durationMinutes: 15,
    });
    expect(result.blocks.find((block) => block.id === "cocktail-previa")).toMatchObject({
      start: "11:40",
      end: "12:15",
      durationMinutes: 35,
    });
    expect(result.blocks.find((block) => block.id === "banquet-previa")?.start).toBe("14:52");
    expect(result.blocks.find((block) => block.id === "banquet-previa")?.durationMinutes).toBe(23);
    expect(result.blocks.find((block) => block.id === "party-previa")?.start).toBe("16:55");
    expect(result.blocks.find((block) => block.id === "party-previa")?.durationMinutes).toBe(45);
    expect(result.blocks.find((block) => block.id === "banquet-close")?.durationMinutes).toBe(120);
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
    expect(result.blocks.find((block) => block.id === "party-close")?.durationMinutes).toBe(168);
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

    expect(result.blocks.find((block) => block.id === "stand-P_CE-ceremony-1-previa")).toMatchObject({
      start: "11:30",
      end: "12:15",
      durationMinutes: 45,
    });
    expect(result.blocks.find((block) => block.id === "stand-P_CE-ceremony-1-service")?.start).toBe("13:00");
    expect(result.blocks.find((block) => block.id === "stand-P_CR-party-1-previa")).toMatchObject({
      start: "11:30",
      end: "12:15",
      durationMinutes: 45,
    });
    expect(result.blocks.find((block) => block.id === "stand-P_CR-party-1-service")?.end).toBe(
      event.party.segments[event.party.segments.length - 1]?.end,
    );
  });

  it("uses configured party hours for service blocks only", () => {
    const event = applyOperationalSchedule({
      ...createEmptyEvent(),
      party: {
        ...createEmptyEvent().party,
        totalMinutes: 180,
      },
      stands: [
        { id: "jamon_1x50", enabled: false, moment: "cocktail" },
        { id: "quesos_clasico", enabled: false, moment: "cocktail" },
        { id: "croquetas", enabled: true, moment: "party" },
      ],
    });
    const result = generateTimeline(event);
    const partyServiceMinutes = result.blocks
      .filter((block) => block.parentBlockId === "party" && block.phase === "servicio")
      .reduce((sum, block) => sum + block.durationMinutes, 0);
    const lastPartyEnd = event.party.segments[event.party.segments.length - 1]?.end;

    expect(partyServiceMinutes).toBe(180);
    expect(result.blocks.find((block) => block.id === "stand-P_CR-party-1-service")).toMatchObject({
      start: event.party.segments[0]?.start,
      end: lastPartyEnd,
      durationMinutes: 180,
    });
    expect(result.blocks.find((block) => block.id === "party-close")?.durationMinutes).toBe(168);
  });

  it("creates previa and servicio blocks for every configured stand", () => {
    const standRefs: Record<(typeof DEFAULT_STANDS)[number]["id"], string> = {
      arroz: "P_AR",
      cerveza: "P_CE",
      croquetas: "P_CR",
      huevos: "P_HU",
      jamon_1x50: "P_JA",
      jamon_2h: "P_JA_2j",
      mojitos: "P_MO",
      navajas_zamburinas: "P_NA-ZA",
      quesos_clasico: "P_QU_C",
      quesos_embutidos: "P_QU-EM",
      sushi: "P_SU",
      tortilla: "P_TO",
      vermut: "P_VE",
    };
    const event = applyOperationalSchedule({
      ...createEmptyEvent(),
      stands: DEFAULT_STANDS.map((stand) => ({ ...stand, enabled: true, moment: "cocktail" })),
    });
    const result = generateTimeline(event);

    DEFAULT_STANDS.forEach((stand) => {
      const ref = standRefs[stand.id];
      expect(result.blocks.some((block) => block.id === `stand-${ref}-cocktail-1-previa`)).toBe(true);
      expect(result.blocks.some((block) => block.id === `stand-${ref}-cocktail-1-service`)).toBe(true);
    });
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
