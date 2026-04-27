import { create } from "zustand";
import { duplicateEventConfig, normalizeEventConfig } from "../domain/defaults";
import { generateTimeline } from "../domain/timelineEngine";
import type { EventConfig, TimelineEventSummary, TimelineResult, TimelineSnapshot } from "../domain/types";
import { exampleEvents } from "../data/examples";
import {
  deleteTimelineEvent,
  getTimelineEvent,
  listTimelineEvents,
  markAssumptionReviewed,
  saveTimelineSnapshot,
} from "../services/supabase";

interface TimelineState {
  events: TimelineEventSummary[];
  draft?: EventConfig;
  result?: TimelineResult;
  dbId?: string;
  loading: boolean;
  saving: boolean;
  error?: string;
  loadEvents: () => Promise<void>;
  createDraft: () => void;
  openExample: (index: number) => void;
  openEvent: (dbId: string) => Promise<void>;
  duplicateCurrent: () => void;
  deleteEvent: (dbId: string) => Promise<void>;
  updateDraft: (updater: (draft: EventConfig) => EventConfig) => void;
  regenerate: () => TimelineResult | undefined;
  saveCurrent: () => Promise<TimelineSnapshot | undefined>;
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
  };
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  events: [],
  loading: false,
  saving: false,

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
    const draft = normalizeEventConfig({} as EventConfig);
    const result = generateTimeline(draft);
    set({ draft, result, dbId: undefined, error: undefined });
  },

  openExample(index: number) {
    const source = exampleEvents[index] ?? exampleEvents[0];
    const draft = normalizeEventConfig({ ...source, id: `${source.id}-${Date.now().toString(36)}` });
    const result = generateTimeline(draft);
    set({ draft, result, dbId: undefined, error: undefined });
  },

  async openEvent(dbId: string) {
    set({ loading: true, error: undefined });
    try {
      const snapshot = await getTimelineEvent(dbId);
      const draft = normalizeEventConfig(snapshot.eventConfig);
      const result = snapshot.blocks?.length ? resultFromSnapshot(snapshot) : generateTimeline(draft);
      set({ draft, result, dbId: snapshot.dbId ?? dbId, loading: false });
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
    set({ draft: duplicated, result: generateTimeline(duplicated), dbId: undefined, error: undefined });
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
    const draft = normalizeEventConfig(updater(current));
    set({ draft, result: generateTimeline(draft), error: undefined });
  },

  regenerate() {
    const { draft } = get();
    if (!draft) {
      return undefined;
    }
    const result = generateTimeline(draft);
    set({ result });
    return result;
  },

  async saveCurrent() {
    const { draft, result, dbId } = get();
    if (!draft) {
      return undefined;
    }
    const freshResult = result ?? generateTimeline(draft);
    set({ saving: true, error: undefined });
    try {
      const saved = await saveTimelineSnapshot(buildSnapshot(draft, freshResult, dbId));
      const normalizedDraft = normalizeEventConfig(saved.eventConfig);
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
        draft: normalizeEventConfig(snapshot.eventConfig),
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

