import { create } from "zustand";
import { fallbackEventCatalog } from "../data/catalog";
import { applyOperationalSchedule, createEmptyEvent, duplicateEventConfig, shiftEventConfig } from "../domain/defaults";
import { computeStaffingSummary } from "../domain/staffing";
import { generateTimeline } from "../domain/timelineEngine";
import type { EventCatalog, EventConfig, TimelineEventSummary, TimelineResult, TimelineSnapshot } from "../domain/types";
import { exampleEvents } from "../data/examples";
import {
  deleteTimelineEvent,
  getEventCatalog,
  getTimelineEvent,
  listTimelineEvents,
  markAssumptionReviewed,
  saveCurrentEventWithTasks,
  saveTimelineSnapshot,
  shiftEventTimeline,
} from "../services/supabase";

interface TimelineState {
  events: TimelineEventSummary[];
  draft?: EventConfig;
  result?: TimelineResult;
  catalog: EventCatalog;
  catalogSource: "fallback" | "supabase";
  dbId?: string;
  loading: boolean;
  saving: boolean;
  error?: string;
  loadCatalog: () => Promise<void>;
  loadEvents: () => Promise<void>;
  createDraft: () => void;
  openExample: (index: number) => void;
  openEvent: (dbId: string) => Promise<void>;
  duplicateCurrent: () => void;
  deleteEvent: (dbId: string) => Promise<void>;
  updateDraft: (updater: (draft: EventConfig) => EventConfig) => void;
  regenerate: () => TimelineResult | undefined;
  saveCurrent: () => Promise<TimelineSnapshot | undefined>;
  saveCurrentWithTasks: () => Promise<TimelineSnapshot | undefined>;
  shiftTimeline: (minutes: number, employeeId?: string) => Promise<TimelineSnapshot | undefined>;
  setAssumptionReviewed: (assumptionId: string, reviewed: boolean) => Promise<void>;
  clearError: () => void;
}

function buildSnapshot(draft: EventConfig, result: TimelineResult, dbId?: string): TimelineSnapshot {
  return {
    ...result,
    dbId,
    externalId: draft.id,
    eventConfig: draft,
  };
}

function resultFromSnapshot(snapshot: TimelineSnapshot): TimelineResult {
  return {
    blocks: snapshot.blocks ?? [],
    assumptions: snapshot.assumptions ?? [],
    appliedBlocks: snapshot.appliedBlocks ?? [],
    warnings: snapshot.warnings ?? [],
    summary: snapshot.summary,
    staffing:
      snapshot.staffing ??
      computeStaffingSummary(snapshot.eventConfig, snapshot.blocks ?? []),
  };
}

function generateWithCatalog(draft: EventConfig, catalog: EventCatalog): TimelineResult {
  return generateTimeline(draft, catalog);
}

function draftFromEventSummary(event: TimelineEventSummary): EventConfig {
  return applyOperationalSchedule({
    ...createEmptyEvent(),
    id: event.externalId,
    name: event.name,
    date: event.date,
    pax: event.pax,
    openDoorsTime: event.openDoorsTime,
    endTime: event.endTime,
    notes: event.venueName ? `Espacio CRM: ${event.venueName}` : undefined,
  });
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  events: [],
  catalog: fallbackEventCatalog,
  catalogSource: "fallback",
  loading: false,
  saving: false,

  async loadCatalog() {
    try {
      const catalog = await getEventCatalog(get().draft?.pax);
      const draft = get().draft;
      set({
        catalog,
        catalogSource: "supabase",
        result: draft ? generateWithCatalog(draft, catalog) : get().result,
      });
    } catch {
      const draft = get().draft;
      set({
        catalog: fallbackEventCatalog,
        catalogSource: "fallback",
        result: draft ? generateWithCatalog(draft, fallbackEventCatalog) : get().result,
      });
    }
  },

  async loadEvents() {
    set({ loading: true, error: undefined });
    try {
      const events = await listTimelineEvents();
      set({ events, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  createDraft() {
    const draft = applyOperationalSchedule({} as EventConfig);
    const result = generateWithCatalog(draft, get().catalog);
    set({ draft, result, dbId: undefined, error: undefined });
  },

  openExample(index: number) {
    const source = exampleEvents[index] ?? exampleEvents[0];
    const draft = applyOperationalSchedule({ ...source, id: `${source.id}-${Date.now().toString(36)}` });
    const result = generateWithCatalog(draft, get().catalog);
    set({ draft, result, dbId: undefined, error: undefined });
  },

  async openEvent(dbId: string) {
    set({ loading: true, error: undefined });
    try {
      if (dbId.startsWith("crm:")) {
        const event = get().events.find((item) => item.dbId === dbId);
        if (!event) {
          throw new Error("No se encontro el evento CRM en la lista actual.");
        }
        const draft = draftFromEventSummary(event);
        try {
          const catalog = await getEventCatalog(draft.pax);
          set({
            catalog,
            catalogSource: "supabase",
            draft,
            result: generateWithCatalog(draft, catalog),
            dbId: undefined,
            loading: false,
          });
        } catch {
          set({
            catalog: fallbackEventCatalog,
            catalogSource: "fallback",
            draft,
            result: generateWithCatalog(draft, fallbackEventCatalog),
            dbId: undefined,
            loading: false,
          });
        }
        return;
      }

      const snapshot = await getTimelineEvent(dbId);
      const draft = applyOperationalSchedule(snapshot.eventConfig);
      try {
        const catalog = await getEventCatalog(draft.pax);
        set({
          catalog,
          catalogSource: "supabase",
          draft,
          result: generateWithCatalog(draft, catalog),
          dbId: snapshot.dbId ?? dbId,
          loading: false,
        });
      } catch {
        set({
          catalog: fallbackEventCatalog,
          catalogSource: "fallback",
          draft,
          result: generateWithCatalog(draft, fallbackEventCatalog),
          dbId: snapshot.dbId ?? dbId,
          loading: false,
        });
      }
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  duplicateCurrent() {
    const { draft } = get();
    if (!draft) {
      return;
    }
    const duplicated = duplicateEventConfig(draft);
    set({ draft: duplicated, result: generateWithCatalog(duplicated, get().catalog), dbId: undefined, error: undefined });
  },

  async deleteEvent(dbId: string) {
    set({ loading: true, error: undefined });
    try {
      await deleteTimelineEvent(dbId);
      await get().loadEvents();
      if (get().dbId === dbId) {
        set({ draft: undefined, result: undefined, dbId: undefined });
      }
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  updateDraft(updater) {
    const current = get().draft;
    if (!current) {
      return;
    }
    const draft = applyOperationalSchedule(updater(current));
    set({ draft, result: generateWithCatalog(draft, get().catalog), error: undefined });
  },

  regenerate() {
    const { draft } = get();
    if (!draft) {
      return undefined;
    }
    const result = generateWithCatalog(draft, get().catalog);
    set({ result });
    return result;
  },

  async saveCurrent() {
    const { draft, result, dbId } = get();
    if (!draft) {
      return undefined;
    }
    const freshResult = result ?? generateWithCatalog(draft, get().catalog);
    set({ saving: true, error: undefined });
    try {
      const saved = await saveTimelineSnapshot(buildSnapshot(draft, freshResult, dbId));
      const normalizedDraft = applyOperationalSchedule(saved.eventConfig);
      set({
        dbId: saved.dbId,
        draft: normalizedDraft,
        result: resultFromSnapshot(saved),
        saving: false,
      });
      await get().loadEvents();
      return saved;
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
      return undefined;
    }
  },

  async saveCurrentWithTasks() {
    const { draft, result, dbId } = get();
    if (!draft) {
      return undefined;
    }
    const freshResult = result ?? generateWithCatalog(draft, get().catalog);
    set({ saving: true, error: undefined });
    try {
      const saved = await saveCurrentEventWithTasks(buildSnapshot(draft, freshResult, dbId), get().catalog);
      const normalizedDraft = applyOperationalSchedule(saved.eventConfig);
      set({
        dbId: saved.dbId,
        draft: normalizedDraft,
        result: resultFromSnapshot(saved),
        saving: false,
      });
      await get().loadEvents();
      return saved;
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
      return undefined;
    }
  },

  async shiftTimeline(minutes, employeeId) {
    const { draft, dbId } = get();
    if (!draft || !dbId) {
      set({ error: "Guarda y abre un evento antes de mover el timeline." });
      return undefined;
    }
    const shiftedDraft = shiftEventConfig(draft, minutes);
    const shiftedResult = generateWithCatalog(shiftedDraft, get().catalog);
    set({ saving: true, error: undefined });
    try {
      const saved = await shiftEventTimeline(
        buildSnapshot(shiftedDraft, shiftedResult, dbId),
        get().catalog,
        { minutes, employeeId },
      );
      const normalizedDraft = applyOperationalSchedule(saved.eventConfig);
      set({
        dbId: saved.dbId,
        draft: normalizedDraft,
        result: resultFromSnapshot(saved),
        saving: false,
      });
      await get().loadEvents();
      return saved;
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
      return undefined;
    }
  },

  async setAssumptionReviewed(assumptionId: string, reviewed: boolean) {
    const { dbId } = get();
    if (!dbId) {
      const { result } = get();
      if (!result) {
        return;
      }
      set({
        result: {
          ...result,
          assumptions: result.assumptions.map((item) =>
            item.id === assumptionId ? { ...item, reviewed } : item,
          ),
        },
      });
      return;
    }
    set({ saving: true, error: undefined });
    try {
      const snapshot = await markAssumptionReviewed(dbId, assumptionId, reviewed);
      set({
        result: resultFromSnapshot(snapshot),
        draft: applyOperationalSchedule(snapshot.eventConfig),
        saving: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
    }
  },

  clearError() {
    set({ error: undefined });
  },
}));
