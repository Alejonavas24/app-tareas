import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import type { CatalogEventBlock, CatalogTask, EventCatalog, TimelineEventSummary, TimelineSnapshot } from "../domain/types";

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

export async function listTimelineEvents(): Promise<TimelineEventSummary[]> {
  return [];
}

export async function getEventCatalog(pax?: number): Promise<EventCatalog> {
  ensureEnv();
  const [blocksResult, tasksResult] = await Promise.all([
    supabase
      .from("event_catalog_blocks")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("block_sort", { ascending: true })
      .order("block_id", { ascending: true }),
    supabase
      .from("event_catalog_tasks")
      .select("*")
      .order("block_id", { ascending: true })
      .order("task_sort", { ascending: true, nullsFirst: false })
      .order("task_code", { ascending: true }),
  ]);

  if (blocksResult.error) {
    throw new Error(blocksResult.error.message);
  }
  if (tasksResult.error) {
    throw new Error(tasksResult.error.message);
  }

  const blocks = (blocksResult.data ?? []).map(mapCatalogBlock);
  const tasks = (tasksResult.data ?? []).map(mapCatalogTask);

  return {
    blocks,
    tasks,
    hasOver200Adjustments: (pax ?? 0) > 200,
    validation: {
      blocks: blocks.length,
      tasks: tasks.length,
      tasksWithoutBlock: tasks.filter((task) => !task.blockId).length,
      blockTaskCodes: blocks.reduce((total, block) => total + (block.taskCodes?.length ?? 0), 0),
      over200TaskAdjustments: tasks.filter((task) => task.over200Affected).length,
      over200NonTaskAdjustments: blocks.reduce(
        (total, block) => total + (block.over200NonTaskAdjustments?.length ?? 0),
        0,
      ),
    },
  };
}

type CatalogBlockRow = {
  block_id: string;
  block_sort: string;
  sort_order: number | null;
  macrofase: string | null;
  block_name: string;
  references: string | null;
  moments: string | null;
  block_type: string | null;
  turno_sugerido: string | null;
  rol_principal: string | null;
  min_personas_bloque: string | null;
  staff_min: number | null;
  staff_max: number | null;
  regla_dotacion: string | null;
  continuidad_dependencia: string | null;
  hito_relevo: string | null;
  num_tareas_camareros: number | null;
  rango_codigos_camareros: string | null;
  codigos_camareros_lista: string | null;
  task_codes: string[] | null;
  codigos_relacionados_otros_roles: string | null;
  notas_operativas: string | null;
  duracion_referencia_min: number | null;
  observacion_acta: string | null;
  over_200_adjustment: string | null;
  over_200_waiter_codes: string[] | null;
  over_200_other_role_codes: string[] | null;
  over_200_notes: string | null;
  over_200_duration_reference_min: number | null;
  over_200_observacion_acta: string | null;
  over_200_non_task_adjustments: unknown[] | null;
};

type CatalogTaskRow = {
  task_code: string;
  block_id: string;
  task_sort: number | null;
  referencia: string | null;
  momento: string | null;
  responsable: string | null;
  task_name: string;
  num_personas: string | null;
  staff_min: number | null;
  staff_max: number | null;
  dependency_code: string | null;
  details: string | null;
  time_min_min: number | null;
  time_max_min: number | null;
  observaciones: string | null;
  macrofase: string | null;
  tipo_bloque: string | null;
  turno: string | null;
  over_200_affected: boolean | null;
  over_200_scope: string | null;
  over_200_adjustment: string | null;
  over_200_notes: string | null;
};

function mapCatalogBlock(row: CatalogBlockRow): CatalogEventBlock {
  return {
    blockId: row.block_id,
    blockSort: row.block_sort,
    sortOrder: row.sort_order,
    macrofase: row.macrofase,
    blockName: row.block_name,
    references: row.references,
    moments: row.moments,
    blockType: row.block_type,
    turnoSugerido: row.turno_sugerido,
    rolPrincipal: row.rol_principal,
    minPersonasBloque: row.min_personas_bloque,
    staffMin: row.staff_min,
    staffMax: row.staff_max,
    reglaDotacion: row.regla_dotacion,
    continuidadDependencia: row.continuidad_dependencia,
    hitoRelevo: row.hito_relevo,
    numTareasCamareros: row.num_tareas_camareros,
    rangoCodigosCamareros: row.rango_codigos_camareros,
    codigosCamarerosLista: row.codigos_camareros_lista,
    taskCodes: row.task_codes ?? [],
    codigosRelacionadosOtrosRoles: row.codigos_relacionados_otros_roles,
    notasOperativas: row.notas_operativas,
    duracionReferenciaMin: row.duracion_referencia_min,
    observacionActa: row.observacion_acta,
    over200Adjustment: row.over_200_adjustment,
    over200WaiterCodes: row.over_200_waiter_codes ?? [],
    over200OtherRoleCodes: row.over_200_other_role_codes ?? [],
    over200Notes: row.over_200_notes,
    over200DurationReferenceMin: row.over_200_duration_reference_min,
    over200ObservacionActa: row.over_200_observacion_acta,
    over200NonTaskAdjustments: row.over_200_non_task_adjustments ?? [],
  };
}

function mapCatalogTask(row: CatalogTaskRow): CatalogTask {
  return {
    taskCode: row.task_code,
    blockId: row.block_id,
    taskSort: row.task_sort,
    referencia: row.referencia,
    momento: row.momento,
    responsable: row.responsable,
    taskName: row.task_name,
    numPersonas: row.num_personas,
    staffMin: row.staff_min,
    staffMax: row.staff_max,
    dependencyCode: row.dependency_code,
    details: row.details,
    timeMinMin: row.time_min_min,
    timeMaxMin: row.time_max_min,
    observaciones: row.observaciones,
    macrofase: row.macrofase,
    tipoBloque: row.tipo_bloque,
    turno: row.turno,
    over200Affected: row.over_200_affected ?? false,
    over200Scope: row.over_200_scope,
    over200Adjustment: row.over_200_adjustment,
    over200Notes: row.over_200_notes,
  };
}

export async function getTimelineEvent(dbId: string): Promise<TimelineSnapshot> {
  throw new Error(`La persistencia de eventos fue retirada del backend actual (${dbId}).`);
}

export async function saveTimelineSnapshot(snapshot: TimelineSnapshot): Promise<TimelineSnapshot> {
  throw new Error(`La persistencia de eventos fue retirada del backend actual (${snapshot.externalId}).`);
}

export async function deleteTimelineEvent(dbId: string): Promise<void> {
  throw new Error(`La persistencia de eventos fue retirada del backend actual (${dbId}).`);
}

export async function markAssumptionReviewed(
  dbId: string,
  assumptionId: string,
  reviewed: boolean,
): Promise<TimelineSnapshot> {
  throw new Error(
    `La persistencia de revisiones fue retirada del backend actual (${dbId}, ${assumptionId}, ${String(reviewed)}).`,
  );
}
