import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import type {
  AssignableEmployee,
  CatalogEventBlock,
  CatalogTask,
  DeviceSession,
  EventCatalog,
  EventStaffAssignment,
  EventTaskInstance,
  TaskExecutionLog,
  TimelineEventSummary,
  TimelineSnapshot,
  WorkerTask,
} from "../domain/types";
import { parseRoles } from "../domain/assignments";
import { previewMaterializedTasks } from "../domain/taskMaterialization";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const deviceSupabaseUrl = process.env.EXPO_PUBLIC_DEVICE_SUPABASE_URL ?? "";
const deviceSupabaseAnonKey = process.env.EXPO_PUBLIC_DEVICE_SUPABASE_ANON_KEY ?? "";

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);
export const hasDeviceSupabaseEnv = Boolean(deviceSupabaseUrl && deviceSupabaseAnonKey);

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

export const deviceSupabase = createClient(
  deviceSupabaseUrl || "https://pqqyaytegdemfobrutmt.supabase.co",
  deviceSupabaseAnonKey || "anon-key-missing",
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

function ensureDeviceEnv() {
  if (!hasDeviceSupabaseEnv) {
    throw new Error(
      "Faltan EXPO_PUBLIC_DEVICE_SUPABASE_URL y EXPO_PUBLIC_DEVICE_SUPABASE_ANON_KEY en mobile/.env",
    );
  }
}

function isMissingRpcError(error: { message?: string; code?: string } | null | undefined): boolean {
  return error?.code === "PGRST202" || (error?.message ?? "").includes("Could not find the function");
}

export async function listTimelineEvents(): Promise<TimelineEventSummary[]> {
  ensureEnv();
  const [timelineResult, plannerResult] = await Promise.all([
    supabase.rpc("list_timeline_events"),
    supabase.rpc("list_planner_events", {
      p_date_from: dateOffset(-30),
      p_date_to: dateOffset(365),
    }),
  ]);

  if (plannerResult.error) {
    throw new Error(plannerResult.error.message);
  }

  const savedEvents = ((timelineResult.data ?? []) as TimelineEventSummary[]).map((event) => ({
    ...event,
    source: "timeline" as const,
    hasTimelineSnapshot: true,
  }));
  const savedByExternalId = new Map(savedEvents.map((event) => [event.externalId, event]));

  return ((plannerResult.data ?? []) as PlannerEventRow[])
    .map((row) => mapPlannerEvent(row, savedByExternalId.get(row.external_event_id)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

type PlannerEventRow = {
  planner_evento_id: number;
  external_event_id: string;
  nombre_evento: string | null;
  fecha_evento: string;
  espacio_nombre: string | null;
  estado_planificacion: string | null;
  ruptura_inventario: boolean | null;
  invitados: number | null;
};

function mapPlannerEvent(
  row: PlannerEventRow,
  saved?: TimelineEventSummary,
): TimelineEventSummary {
  const externalId = row.external_event_id || `planner:${row.planner_evento_id}`;
  return {
    dbId: saved?.dbId ?? `crm:${row.planner_evento_id}`,
    externalId,
    name: row.nombre_evento ?? "Evento CRM",
    date: row.fecha_evento,
    pax: Math.max(row.invitados ?? saved?.pax ?? 1, 1),
    openDoorsTime: saved?.openDoorsTime ?? "12:15",
    endTime: saved?.endTime,
    summary: saved?.summary,
    warnings: saved?.warnings,
    updatedAt: saved?.updatedAt,
    createdAt: saved?.createdAt,
    source: "crm",
    plannerEventId: row.planner_evento_id,
    venueName: row.espacio_nombre,
    planningStatus: row.estado_planificacion,
    inventoryBreak: row.ruptura_inventario ?? false,
    hasTimelineSnapshot: Boolean(saved),
  };
}

export async function getEventCatalog(pax?: number): Promise<EventCatalog> {
  ensureEnv();
  let [blocksResult, tasksResult] = await Promise.all([
    queryCatalogBlocks("public", "event_catalog_blocks"),
    queryCatalogTasks("public", "event_catalog_tasks"),
  ]);

  if (blocksResult.error || tasksResult.error) {
    [blocksResult, tasksResult] = await Promise.all([
      queryCatalogBlocks("tareas", "event_blocks"),
      queryCatalogTasks("tareas", "event_tasks"),
    ]);
  }

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

function queryCatalogBlocks(schema: "public" | "tareas", table: string) {
  const source = schema === "public" ? supabase.from(table) : supabase.schema(schema).from(table);
  return source
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("block_sort", { ascending: true })
    .order("block_id", { ascending: true });
}

function queryCatalogTasks(schema: "public" | "tareas", table: string) {
  const source = schema === "public" ? supabase.from(table) : supabase.schema(schema).from(table);
  return source
    .select("*")
    .order("block_id", { ascending: true })
    .order("task_sort", { ascending: true, nullsFirst: false })
    .order("task_code", { ascending: true });
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
  duracion_minima?: number | null;
  duracion_max?: number | null;
  duracion_referencia_min?: number | null;
  observacion_acta: string | null;
  over_200_adjustment: string | null;
  over_200_waiter_codes: string[] | null;
  over_200_other_role_codes: string[] | null;
  over_200_notes: string | null;
  over_200_duration_reference_min?: number | null;
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
    duracionMinima: row.duracion_minima ?? null,
    duracionMax: row.duracion_max ?? null,
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
    requiredLevel: 0,
  };
}

export async function getTimelineEvent(dbId: string): Promise<TimelineSnapshot> {
  ensureEnv();
  const { data, error } = await supabase.rpc("get_timeline_event", { p_event_id: dbId });
  if (error) {
    throw new Error(error.message);
  }
  return data as TimelineSnapshot;
}

export async function saveTimelineSnapshot(snapshot: TimelineSnapshot): Promise<TimelineSnapshot> {
  ensureEnv();
  const { data, error } = await supabase.rpc("save_timeline_snapshot", { p_payload: snapshot });
  if (error) {
    throw new Error(error.message);
  }
  return data as TimelineSnapshot;
}

export async function saveCurrentEventWithTasks(
  snapshot: TimelineSnapshot,
  catalog?: EventCatalog,
): Promise<TimelineSnapshot> {
  const saved = await saveTimelineSnapshot(snapshot);
  if (!saved.dbId) {
    return saved;
  }
  const taskPayload = catalog ? previewMaterializedTasks(saved.blocks ?? [], catalog).map((task) => ({
    block_key: task.blockKey,
    block_id: task.blockId,
    task_code: task.taskCode,
    task_sort: task.taskSort ?? null,
    task_name: task.taskName,
    details: task.details ?? null,
    start_time: task.startTime,
    end_time: task.endTime,
    responsable: task.responsable ?? null,
    dependency_code: task.dependencyCode ?? null,
    required_level: task.requiredLevel,
    required_staff_min: task.requiredStaffMin ?? null,
    staffing_rule: task.staffingRule ?? null,
    num_personas: task.numPersonas ?? null,
  })) : [];

  if (taskPayload.length > 0) {
    const payloadResult = await supabase.rpc("materialize_event_tasks_from_payload", {
      p_event_id: saved.dbId,
      p_tasks: taskPayload,
    });
    if (payloadResult.error) {
      const legacyResult = await supabase.rpc("materialize_event_tasks", { p_event_id: saved.dbId });
      if (legacyResult.error) {
        throw new Error(
          `Evento guardado, pero no se pudieron materializar tareas: ${payloadResult.error.message}; ${legacyResult.error.message}`,
        );
      }
    }
  } else {
    const { error } = await supabase.rpc("materialize_event_tasks", { p_event_id: saved.dbId });
    if (error) {
      throw new Error(`Evento guardado, pero no se pudieron materializar tareas: ${error.message}`);
    }
  }
  return getTimelineEvent(saved.dbId);
}

function taskPayloadFromSnapshot(snapshot: TimelineSnapshot, catalog?: EventCatalog) {
  return catalog ? previewMaterializedTasks(snapshot.blocks ?? [], catalog).map((task) => ({
    block_key: task.blockKey,
    block_id: task.blockId,
    task_code: task.taskCode,
    task_sort: task.taskSort ?? null,
    task_name: task.taskName,
    details: task.details ?? null,
    start_time: task.startTime,
    end_time: task.endTime,
    responsable: task.responsable ?? null,
    dependency_code: task.dependencyCode ?? null,
    required_level: task.requiredLevel,
    required_staff_min: task.requiredStaffMin ?? null,
    staffing_rule: task.staffingRule ?? null,
    num_personas: task.numPersonas ?? null,
  })) : [];
}

export async function shiftEventTimeline(
  snapshot: TimelineSnapshot,
  catalog: EventCatalog | undefined,
  options: { minutes: number; employeeId?: string },
): Promise<TimelineSnapshot> {
  ensureEnv();
  if (!snapshot.dbId) {
    throw new Error("Guarda el evento antes de mover el timeline.");
  }
  const { data, error } = await supabase.rpc("shift_event_timeline_from_payload", {
    p_event_id: snapshot.dbId,
    p_payload: snapshot,
    p_tasks: taskPayloadFromSnapshot(snapshot, catalog),
    p_minutes: options.minutes,
    p_employee_id: options.employeeId ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
  return data as TimelineSnapshot;
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
  if (error) {
    throw new Error(error.message);
  }
  return data as TimelineSnapshot;
}

type DeviceRow = {
  device_id: string;
  active: boolean | null;
  employee_id: string | number | null;
};

type EmployeeRow = {
  id: string | number;
  full_name: string | null;
  active: boolean | null;
  rol: string | null;
};

export async function validateDeviceSession(deviceId: string): Promise<DeviceSession> {
  ensureDeviceEnv();
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) {
    throw new Error("No se pudo leer el ID nativo del dispositivo.");
  }

  const { data: device, error: deviceError } = await deviceSupabase
    .from("managed_devices")
    .select("device_id, active, employee_id")
    .eq("device_id", normalizedDeviceId)
    .maybeSingle<DeviceRow>();

  if (deviceError) {
    throw new Error(deviceError.message);
  }
  if (!device) {
    throw new Error(`Dispositivo no registrado: ${normalizedDeviceId}`);
  }
  if (!device.active) {
    throw new Error("Este dispositivo esta inactivo.");
  }
  if (!device.employee_id) {
    throw new Error("El dispositivo no tiene empleado asignado.");
  }

  const { data: employee, error: employeeError } = await deviceSupabase
    .from("employees")
    .select("id, full_name, active, rol")
    .eq("id", device.employee_id)
    .maybeSingle<EmployeeRow>();

  if (employeeError) {
    throw new Error(employeeError.message);
  }
  if (!employee) {
    throw new Error("No se encontro el empleado vinculado al dispositivo.");
  }
  if (!employee.active) {
    throw new Error("El empleado vinculado esta inactivo.");
  }

  return {
    deviceId: normalizedDeviceId,
    employeeId: String(employee.id),
    fullName: employee.full_name ?? "Empleado",
    roles: parseRoles(employee.rol),
    active: true,
  };
}

export async function listAssignableWaiters(): Promise<AssignableEmployee[]> {
  ensureDeviceEnv();
  const { data, error } = await deviceSupabase
    .from("employees")
    .select("id, full_name, active, rol")
    .eq("active", true)
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as EmployeeRow[])
    .map((employee) => ({
      employeeId: String(employee.id),
      fullName: employee.full_name ?? "Empleado",
      roles: parseRoles(employee.rol),
      skillLevel: 0,
    }))
    .filter((employee) => employee.roles.includes("camarero"));
}

export async function listEventStaff(eventId: string): Promise<EventStaffAssignment[]> {
  ensureEnv();
  const { data, error } = await supabase.rpc("list_event_staff", { p_event_id: eventId });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as EventStaffAssignment[];
}

export async function upsertEventStaff(
  eventId: string,
  employee: AssignableEmployee,
  shift: Pick<EventStaffAssignment, "shiftName" | "shiftStart" | "shiftEnd">,
): Promise<EventStaffAssignment> {
  ensureEnv();
  const { data, error } = await supabase.rpc("upsert_event_staff", {
    p_event_id: eventId,
    p_employee: employee,
    p_shift: shift,
  });
  if (error) {
    throw new Error(error.message);
  }
  return data as EventStaffAssignment;
}

export async function assignEventBlock(eventId: string, blockKey: string, staffId: string): Promise<void> {
  ensureEnv();
  const { error } = await supabase.rpc("assign_event_block", {
    p_event_id: eventId,
    p_block_key: blockKey,
    p_staff_id: staffId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function autoAssignEventBlocksForStaff(eventId: string, staffId: string): Promise<void> {
  ensureEnv();
  const { error } = await supabase.rpc("assign_event_blocks_for_staff", {
    p_event_id: eventId,
    p_staff_id: staffId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function autoAssignEventBlocksForEvent(eventId: string): Promise<void> {
  ensureEnv();
  const { error } = await supabase.rpc("assign_event_blocks_for_event", {
    p_event_id: eventId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function assignEventTask(taskInstanceId: string, staffId: string): Promise<void> {
  ensureEnv();
  const { error } = await supabase.rpc("assign_event_task", {
    p_task_instance_id: taskInstanceId,
    p_staff_id: staffId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function listEventTasks(eventId: string): Promise<EventTaskInstance[]> {
  ensureEnv();
  const { data, error } = await supabase.rpc("list_event_tasks", { p_event_id: eventId });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as EventTaskInstance[];
}

export async function loadWorkerTasks(
  employeeId: string,
  options: { dateFrom?: string; dateTo?: string; includeCompleted?: boolean } = {},
): Promise<WorkerTask[]> {
  ensureEnv();
  const { data, error } = await supabase.rpc("list_worker_tasks", {
    p_employee_id: employeeId,
    p_date_from: options.dateFrom ?? null,
    p_date_to: options.dateTo ?? null,
    p_include_completed: options.includeCompleted ?? false,
  });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as WorkerTask[];
}

export function subscribeToTaskInstanceChanges(onChange: () => void): () => void {
  ensureEnv();
  const channel = supabase
    .channel("worker-task-instance-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "tareas", table: "event_task_instances" },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function completeTask(taskInstanceId: string, employeeId: string): Promise<void> {
  ensureEnv();
  const { error } = await supabase.rpc("complete_worker_task", {
    p_task_instance_id: taskInstanceId,
    p_employee_id: employeeId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function completeWorkerBlock(eventId: string, blockKey: string, employeeId: string): Promise<void> {
  ensureEnv();
  const { error } = await supabase.rpc("complete_worker_block", {
    p_event_id: eventId,
    p_block_key: blockKey,
    p_employee_id: employeeId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function completeEventBlock(
  eventId: string,
  blockKey: string,
  employeeId: string | undefined,
  source: "metre" | "admin" = "metre",
): Promise<void> {
  ensureEnv();
  const { error } = await supabase.rpc("complete_event_block", {
    p_event_id: eventId,
    p_block_key: blockKey,
    p_employee_id: employeeId ?? null,
    p_source: source,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function listTaskExecutionLogs(eventId: string): Promise<TaskExecutionLog[]> {
  ensureEnv();
  const { data, error } = await supabase.rpc("list_task_execution_logs", { p_event_id: eventId });
  if (error) {
    if (isMissingRpcError(error)) {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []) as TaskExecutionLog[];
}

export async function startTask(taskInstanceId: string, employeeId: string): Promise<void> {
  ensureEnv();
  const { error } = await supabase.rpc("start_worker_task", {
    p_task_instance_id: taskInstanceId,
    p_employee_id: employeeId,
  });
  if (error) {
    throw new Error(error.message);
  }
}
