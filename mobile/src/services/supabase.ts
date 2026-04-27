import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import type { TimelineEventSummary, TimelineSnapshot } from "../domain/types";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || "https://example.supabase.co",
  supabaseAnonKey || "anon-key-missing",
  {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  },
);

function ensureEnv() {
  if (!hasSupabaseEnv) {
    throw new Error("Faltan EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en mobile/.env");
  }
}

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) {
    throw new Error(error.message);
  }
  if (data === null) {
    throw new Error("Supabase no devolvio datos.");
  }
  return data;
}

export async function listTimelineEvents(): Promise<TimelineEventSummary[]> {
  ensureEnv();
  const { data, error } = await supabase.rpc("list_timeline_events");
  return unwrap<TimelineEventSummary[]>(data as TimelineEventSummary[] | null, error);
}

export async function getTimelineEvent(dbId: string): Promise<TimelineSnapshot> {
  ensureEnv();
  const { data, error } = await supabase.rpc("get_timeline_event", { p_event_id: dbId });
  return unwrap<TimelineSnapshot>(data as TimelineSnapshot | null, error);
}

export async function saveTimelineSnapshot(snapshot: TimelineSnapshot): Promise<TimelineSnapshot> {
  ensureEnv();
  const { data, error } = await supabase.rpc("save_timeline_snapshot", { p_payload: snapshot });
  return unwrap<TimelineSnapshot>(data as TimelineSnapshot | null, error);
}

export async function deleteTimelineEvent(dbId: string): Promise<void> {
  ensureEnv();
  const { error } = await supabase.rpc("delete_timeline_event", { p_event_id: dbId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function markAssumptionReviewed(
  dbId: string,
  assumptionId: string,
  reviewed: boolean,
): Promise<TimelineSnapshot> {
  ensureEnv();
  const { data, error } = await supabase.rpc("mark_timeline_assumption_reviewed", {
    p_event_id: dbId,
    p_assumption_key: assumptionId,
    p_reviewed: reviewed,
  });
  return unwrap<TimelineSnapshot>(data as TimelineSnapshot | null, error);
}
