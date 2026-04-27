import type { EventConfig } from "./types";

export const DEFAULT_BANQUET_SEGMENTS = [
  { name: "primero", minutes: 30 },
  { name: "sorbete", minutes: 20 },
  { name: "segundo", minutes: 30 },
  { name: "postre", minutes: 30 },
  { name: "cafe", minutes: 30 },
] as const;

export function createEventId(prefix = "EV"): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export function createEmptyEvent(): EventConfig {
  return {
    id: createEventId("BONHO"),
    name: "Nuevo evento",
    date: new Date().toISOString().slice(0, 10),
    pax: 120,
    openDoorsTime: "12:30",
    endTime: "23:00",
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
      displacementAfterMinutes: 15,
      stands: ["jamon_1x50", "quesos_clasico"],
    },
    banquet: {
      enabled: true,
      start: "15:15",
      end: "17:15",
      displacementAfterMinutes: 15,
      momentsExtraMinutes: 0,
      cake: false,
      segments: DEFAULT_BANQUET_SEGMENTS.map((segment) => ({ ...segment })),
    },
    party: {
      enabled: true,
      totalMinutes: 300,
      segments: [{ name: "dj", start: "17:45", end: "23:00" }],
    },
    resopon: {
      enabled: true,
      type: "tradicional",
      serviceWindow: ["21:45", "22:15"],
    },
    briefing: {
      enabled: true,
      mode: "simultaneo",
    },
  };
}

export function normalizeEventConfig(event: EventConfig): EventConfig {
  const base = createEmptyEvent();
  return {
    ...base,
    ...event,
    ceremony: { ...base.ceremony, ...event.ceremony },
    cocktail: {
      ...base.cocktail,
      ...event.cocktail,
      stands: event.cocktail?.stands ?? [],
    },
    banquet: {
      ...base.banquet,
      ...event.banquet,
      segments:
        event.banquet?.segments?.length > 0
          ? event.banquet.segments
          : DEFAULT_BANQUET_SEGMENTS.map((segment) => ({ ...segment })),
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

export function duplicateEventConfig(event: EventConfig): EventConfig {
  return normalizeEventConfig({
    ...event,
    id: createEventId("COPY"),
    name: `${event.name} copia`,
  });
}
