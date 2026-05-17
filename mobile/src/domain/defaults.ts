import { addMinutes, diffMinutes, sortHHMM } from "./time";
import type { BanquetSegment, BanquetSegmentName, EventConfig, EventStand, HHMM } from "./types";

export const BANQUET_SEGMENT_OPTIONS: { name: BanquetSegmentName; label: string }[] = [
  { name: "primero", label: "Primer plato" },
  { name: "segundo", label: "Segundo plato" },
  { name: "tarta", label: "Tarta" },
  { name: "sorbete", label: "Sorbete" },
  { name: "postre", label: "Postre" },
  { name: "cafe", label: "Cafe" },
];

const DEFAULT_ACTIVE_BANQUET_SEGMENTS: BanquetSegmentName[] = ["primero", "sorbete", "segundo", "postre", "cafe"];

export const DEFAULT_STANDS: EventStand[] = [
  { id: "jamon_1x50", enabled: true, moment: "cocktail" },
  { id: "quesos_clasico", enabled: true, moment: "cocktail" },
  { id: "croquetas", enabled: false, moment: "cocktail" },
  { id: "cerveza", enabled: false, moment: "ceremony" },
  { id: "arroz", enabled: false, moment: "cocktail" },
  { id: "huevos", enabled: false, moment: "cocktail" },
  { id: "jamon_2h", enabled: false, moment: "cocktail" },
  { id: "mojitos", enabled: false, moment: "cocktail" },
  { id: "navajas_zamburinas", enabled: false, moment: "cocktail" },
  { id: "quesos_embutidos", enabled: false, moment: "cocktail" },
  { id: "sushi", enabled: false, moment: "cocktail" },
  { id: "tortilla", enabled: false, moment: "cocktail" },
  { id: "vermut", enabled: false, moment: "cocktail" },
];

export const DEFAULT_BANQUET_SEGMENTS = [
  { name: "primero", minutes: 30 },
  { name: "sorbete", minutes: 30 },
  { name: "segundo", minutes: 30 },
  { name: "postre", minutes: 30 },
  { name: "cafe", minutes: 30 },
] as const;

const CEREMONY_PREP_MINUTES = 45;
const CEREMONY_SERVICE_MINUTES = 45;
const COCKTAIL_WITHOUT_CEREMONY_OFFSET_MINUTES = 30;
const COCKTAIL_SERVICE_MINUTES = 60;
const BANQUET_DECLARED_MINUTES = 120;
const PARTY_FIRST_SEGMENT_MINUTES = 100;
const RESOPON_BEFORE_PARTY_END_MINUTES = 90;

export function createEventId(prefix = "EV"): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export function createEmptyEvent(): EventConfig {
  const pax = 120;
  return {
    id: createEventId("BONHO"),
    name: "Nuevo evento",
    date: new Date().toISOString().slice(0, 10),
    pax,
    openDoorsTime: "12:15",
    endTime: "00:00",
    stands: DEFAULT_STANDS.map((stand) => ({ ...stand })),
    ceremony: {
      enabled: true,
      start: "13:00",
      end: "13:45",
      displacementAfterMinutes: 15,
      civil: true,
      limonada: true,
      beerStand: false,
    },
    cocktail: {
      enabled: true,
      start: "14:00",
      end: "15:00",
      totalMinutes: COCKTAIL_SERVICE_MINUTES,
      displacementAfterMinutes: 15,
      stands: [],
    },
    banquet: {
      enabled: true,
      start: "15:15",
      end: "17:15",
      displacementAfterMinutes: 15,
      momentsExtraMinutes: 0,
      cake: false,
      segments: buildBanquetSegments(DEFAULT_ACTIVE_BANQUET_SEGMENTS, pax),
    },
    party: {
      enabled: true,
      totalMinutes: 370,
      segments: [
        { name: "tardeo", start: "17:50", end: "19:30" },
        { name: "dj", start: "19:30", end: "00:00" },
      ],
    },
    resopon: {
      enabled: true,
      type: "tradicional",
      serviceWindow: ["22:30", "22:30"],
    },
    briefing: {
      enabled: true,
      mode: "simultaneo",
    },
  };
}

export function banquetSegmentMinutes(pax: number): number {
  return pax > 200 ? 45 : 30;
}

export function buildBanquetSegments(names: BanquetSegmentName[], pax: number): BanquetSegment[] {
  const minutes = banquetSegmentMinutes(pax);
  const orderedNames = BANQUET_SEGMENT_OPTIONS.map((option) => option.name).filter((name) => names.includes(name));
  return orderedNames.map((name) => ({ name, minutes }));
}

function normalizeStands(event: Partial<EventConfig>, base: EventConfig): EventStand[] {
  const legacyCocktailStands = event.cocktail?.stands ?? [];
  const providedStands = event.stands;
  const byId = new Map<string, EventStand>();

  base.stands.forEach((stand) => byId.set(stand.id, { ...stand }));

  if (providedStands?.length) {
    providedStands.forEach((stand) => {
      if (byId.has(stand.id)) {
        byId.set(stand.id, { ...stand });
      }
    });
  } else {
    legacyCocktailStands.forEach((id) => {
      if (byId.has(id)) {
        byId.set(id, { ...(byId.get(id) as EventStand), enabled: true, moment: "cocktail" });
      }
    });
    if (event.ceremony?.beerStand) {
      byId.set("cerveza", { id: "cerveza", enabled: true, moment: "ceremony" });
    }
  }

  return DEFAULT_STANDS.map((stand) => byId.get(stand.id) ?? stand);
}

function normalizeBanquetSegments(event: Partial<EventConfig>, base: EventConfig): BanquetSegment[] {
  const source = event.banquet?.segments?.length ? event.banquet.segments : base.banquet.segments;
  const activeNames = source
    .map((segment) => segment.name)
    .filter((name): name is BanquetSegmentName =>
      BANQUET_SEGMENT_OPTIONS.some((option) => option.name === name),
    );

  if (event.banquet?.cake && !activeNames.includes("tarta")) {
    activeNames.push("tarta");
  }

  return buildBanquetSegments(activeNames, event.pax ?? base.pax);
}

export function normalizeEventConfig(event: EventConfig): EventConfig {
  const base = createEmptyEvent();
  const stands = normalizeStands(event, base);
  const segments = normalizeBanquetSegments(event, base);
  return {
    ...base,
    ...event,
    stands,
    ceremony: { ...base.ceremony, ...event.ceremony, beerStand: stands.some((stand) => stand.id === "cerveza" && stand.enabled && stand.moment === "ceremony") },
    cocktail: {
      ...base.cocktail,
      ...event.cocktail,
      stands: stands.filter((stand) => stand.enabled && stand.moment === "cocktail").map((stand) => stand.id),
    },
    banquet: {
      ...base.banquet,
      ...event.banquet,
      segments,
      cake: segments.some((segment) => segment.name === "tarta"),
    },
    party: {
      ...base.party,
      ...event.party,
      segments: event.party?.segments ?? [],
    },
    resopon: { ...base.resopon, ...event.resopon },
    briefing: {
      enabled: event.briefing?.enabled ?? base.briefing!.enabled,
      mode: event.briefing?.mode ?? base.briefing!.mode,
      start: event.briefing?.start ?? base.briefing!.start,
      end: event.briefing?.end ?? base.briefing!.end,
    },
  };
}

function banquetServiceMinutes(event: EventConfig): number {
  return event.banquet.segments.reduce((sum, segment) => sum + segment.minutes, 0) + (event.banquet.momentsExtraMinutes ?? 0);
}

function laterTime(a: HHMM, b: HHMM, anchor: HHMM): HHMM {
  return sortHHMM(a, b, anchor) >= 0 ? a : b;
}

function partySegments(start: HHMM, totalMinutes: number) {
  const firstEnd = addMinutes(start, Math.min(PARTY_FIRST_SEGMENT_MINUTES, totalMinutes));
  const finalEnd = addMinutes(start, totalMinutes);

  if (diffMinutes(start, finalEnd) <= PARTY_FIRST_SEGMENT_MINUTES) {
    return [{ name: "fiesta", start, end: finalEnd }];
  }

  return [
    { name: "tardeo", start, end: firstEnd },
    { name: "dj", start: firstEnd, end: finalEnd },
  ];
}

export function applyOperationalSchedule(input: EventConfig): EventConfig {
  const event = normalizeEventConfig(input);
  let cursor = event.openDoorsTime;

  const ceremonyStart = addMinutes(event.openDoorsTime, CEREMONY_PREP_MINUTES);
  const ceremonyEnd = addMinutes(ceremonyStart, CEREMONY_SERVICE_MINUTES);
  const ceremony = {
    ...event.ceremony,
    start: ceremonyStart,
    end: ceremonyEnd,
  };

  if (event.ceremony.enabled) {
    cursor = ceremonyEnd;
  }

  const cocktailStart = event.ceremony.enabled
    ? addMinutes(ceremonyEnd, event.ceremony.displacementAfterMinutes ?? 15)
    : addMinutes(event.openDoorsTime, COCKTAIL_WITHOUT_CEREMONY_OFFSET_MINUTES);
  const cocktailTotal = event.cocktail.totalMinutes ?? COCKTAIL_SERVICE_MINUTES;
  const cocktailEnd = addMinutes(cocktailStart, cocktailTotal);
  const cocktail = {
    ...event.cocktail,
    start: cocktailStart,
    end: cocktailEnd,
  };

  if (event.cocktail.enabled) {
    cursor = cocktailEnd;
  }

  const banquetStart = addMinutes(cursor, event.cocktail.enabled ? event.cocktail.displacementAfterMinutes ?? 15 : 15);
  const banquetDeclaredEnd = addMinutes(banquetStart, BANQUET_DECLARED_MINUTES);
  const banquetOperationalEnd = laterTime(
    addMinutes(banquetStart, banquetServiceMinutes(event)),
    banquetDeclaredEnd,
    event.openDoorsTime,
  );
  const banquet = {
    ...event.banquet,
    start: banquetStart,
    end: banquetDeclaredEnd,
  };

  if (event.banquet.enabled) {
    cursor = banquetOperationalEnd;
  }

  const partyStart = addMinutes(cursor, event.banquet.enabled ? event.banquet.displacementAfterMinutes ?? 15 : 15);
  const partyTotal = event.party.totalMinutes ?? 370;
  const party = {
    ...event.party,
    segments: partySegments(partyStart, partyTotal),
  };
  const partyEnd = party.segments[party.segments.length - 1]?.end ?? partyStart;

  const resoponStart = event.party.enabled ? addMinutes(partyEnd, -RESOPON_BEFORE_PARTY_END_MINUTES) : addMinutes(cursor, 120);
  const resopon = {
    ...event.resopon,
    serviceWindow: [resoponStart, resoponStart] as [HHMM, HHMM],
  };

  return {
    ...event,
    endTime: partyEnd,
    ceremony,
    cocktail,
    banquet,
    party,
    resopon,
  };
}

export function duplicateEventConfig(event: EventConfig): EventConfig {
  return applyOperationalSchedule({
    ...event,
    id: createEventId("COPY"),
    name: `${event.name} copia`,
  });
}

export function shiftEventConfig(event: EventConfig, minutes: number): EventConfig {
  return applyOperationalSchedule({
    ...event,
    openDoorsTime: addMinutes(event.openDoorsTime, minutes),
  });
}
