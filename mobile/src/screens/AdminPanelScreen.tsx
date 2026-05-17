import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CheckCheck, Clock, Save } from "lucide-react-native";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import { isAdmin, isMetre, proposeShift } from "../domain/assignments";
import type { AssignableEmployee, EventStaffAssignment } from "../domain/types";
import type { RootStackParamList } from "../navigation/types";
import { useOperationsStore } from "../store/operationsStore";
import { useSessionStore } from "../store/sessionStore";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "AdminPanel">;

export function AdminPanelScreen({ navigation }: Props) {
  const [manualShiftMinutes, setManualShiftMinutes] = useState("10");
  const { width } = useWindowDimensions();
  const { session } = useSessionStore();
  const sessionRoles = session?.roles ?? [];
  const adminAccess = isAdmin(sessionRoles);
  const metreAccess = isMetre(sessionRoles);
  const metreOnly = metreAccess && !adminAccess;
  const wideWeb = Platform.OS === "web" && width >= 900;
  const {
    draft,
    result,
    dbId,
    events,
    loading: loadingEvents,
    saving: savingEvent,
    error: timelineError,
    createDraft,
    loadEvents,
    openEvent,
    regenerate,
    saveCurrentWithTasks,
    shiftTimeline,
  } = useTimelineStore();
  const {
    waiters,
    staff,
    eventTasks,
    taskLogs,
    loading,
    saving,
    error,
    loadWaiters,
    loadStaff,
    loadEventTasks,
    loadTaskLogs,
    clearEventContext,
    addStaff,
    assignBlock,
    assignTask,
    completeBlockForEvent,
  } = useOperationsStore();

  useEffect(() => {
    if (!draft) {
      createDraft();
    }
  }, [createDraft, draft]);

  useEffect(() => {
    void loadWaiters();
    void loadEvents();
  }, [loadEvents, loadWaiters]);

  useEffect(() => {
    if (dbId) {
      void loadStaff(dbId);
      void loadEventTasks(dbId);
      void loadTaskLogs(dbId);
    }
  }, [dbId, loadEventTasks, loadStaff, loadTaskLogs]);

  const tasksByBlock = useMemo(() => {
    const groups = new Map<string, typeof eventTasks>();
    eventTasks.forEach((task) => {
      groups.set(task.blockKey, [...(groups.get(task.blockKey) ?? []), task]);
    });
    return groups;
  }, [eventTasks]);

  if (!draft || !result) {
    return (
      <Screen title="Panel admin">
        <Text style={styles.empty}>Preparando evento...</Text>
      </Screen>
    );
  }

  if (session && !adminAccess && !metreAccess) {
    return (
      <Screen title="Panel admin">
        <Text style={styles.empty}>Tu rol actual no tiene acceso al panel operativo.</Text>
      </Screen>
    );
  }

  async function handleSaveEvent() {
    regenerate();
    const saved = await saveCurrentWithTasks();
    if (saved?.dbId) {
      await loadStaff(saved.dbId);
      await loadEventTasks(saved.dbId);
      await loadTaskLogs(saved.dbId);
      Alert.alert("Evento guardado", "El evento quedo guardado. Si las tareas salen en 0, revisa la funcion de materializacion.");
    } else {
      Alert.alert("No se pudo guardar", useTimelineStore.getState().error ?? "Revisa la conexion y las funciones RPC.");
    }
  }

  async function handleOpenEvent(eventDbId: string) {
    clearEventContext();
    await openEvent(eventDbId);
    await loadStaff(eventDbId);
    await loadEventTasks(eventDbId);
    await loadTaskLogs(eventDbId);
  }

  function handleNewEvent() {
    clearEventContext();
    createDraft();
  }

  async function handleAddStaff(employee: AssignableEmployee, shiftName: "T1" | "T2") {
    const eventId = useTimelineStore.getState().dbId;
    const currentDraft = useTimelineStore.getState().draft;
    const currentResult = useTimelineStore.getState().result;
    if (!eventId || !currentDraft || !currentResult) {
      Alert.alert("Guarda primero", "Guarda el evento antes de asignar camareros.");
      return;
    }
    await addStaff(eventId, employee, proposeShift(currentDraft, currentResult.blocks, shiftName));
  }

  async function handleAssignBlock(blockKey: string, assignment: EventStaffAssignment) {
    const eventId = useTimelineStore.getState().dbId;
    if (!eventId) {
      Alert.alert("Guarda primero", "Guarda el evento antes de asignar bloques.");
      return;
    }
    await assignBlock(eventId, blockKey, assignment.id);
  }

  async function handleCompleteEventBlock(blockKey: string) {
    const eventId = useTimelineStore.getState().dbId;
    if (!eventId) {
      Alert.alert("Guarda primero", "Guarda el evento antes de completar bloques.");
      return;
    }
    await completeBlockForEvent(eventId, blockKey, session?.employeeId, metreOnly ? "metre" : "admin");
    await loadEventTasks(eventId);
  }

  async function handleShift(minutes: number) {
    if (!Number.isFinite(minutes) || minutes === 0) {
      Alert.alert("Minutos invalidos", "Usa un numero distinto de 0.");
      return;
    }
    const saved = await shiftTimeline(minutes, session?.employeeId);
    if (saved?.dbId) {
      await loadEventTasks(saved.dbId);
      await loadTaskLogs(saved.dbId);
      Alert.alert("Timeline movido", `El evento se movio ${minutes > 0 ? "+" : ""}${minutes} minutos.`);
    } else {
      Alert.alert("No se pudo mover", useTimelineStore.getState().error ?? "Revisa la conexion con Supabase.");
    }
  }

  const eventId = dbId;
  const unassignedWaiters = waiters.filter(
    (waiter) => !staff.some((assignment) => assignment.employeeId === waiter.employeeId),
  );
  const visibleBlocks = wideWeb ? result.blocks : result.blocks.slice(0, 40);
  const visibleEventTasks = wideWeb ? eventTasks : eventTasks.slice(0, 80);

  return (
    <Screen
      title={metreOnly ? "Panel metre" : "Panel admin"}
      subtitle={eventId ? `Evento guardado: ${draft.name}` : "Guarda el evento para operar tareas."}
      footer={
        <View style={styles.footer}>
          <PrimaryButton label="Volver" variant="secondary" onPress={() => navigation.navigate("Home")} />
          {!metreOnly ? (
            <PrimaryButton
              label="Guardar evento"
              icon={Save}
              loading={savingEvent}
              onPress={() => void handleSaveEvent()}
            />
          ) : null}
        </View>
      }
    >
      {timelineError || error ? <Text style={styles.error}>{timelineError ?? error}</Text> : null}

      <SectionCard title="Eventos guardados" caption={loadingEvents ? "Cargando eventos..." : undefined}>
        <View style={styles.inlineActions}>
          {!metreOnly ? <PrimaryButton label="Nuevo" variant="secondary" onPress={handleNewEvent} /> : null}
          <PrimaryButton label="Refrescar" variant="secondary" onPress={() => void loadEvents()} />
        </View>
        {events.length === 0 ? <Text style={styles.empty}>Aun no hay eventos guardados.</Text> : null}
        {events.slice(0, 10).map((event) => (
          <View key={event.dbId} style={styles.eventRow}>
            <View style={styles.rowCopy}>
              <Text style={styles.title}>{event.name}</Text>
              <Text style={styles.meta}>
                {event.date} - {event.pax} pax - {event.summary?.totalBlocks ?? 0} bloques
              </Text>
            </View>
            <PrimaryButton
              label={event.dbId === dbId ? "Abierto" : "Abrir"}
              variant={event.dbId === dbId ? "primary" : "secondary"}
              disabled={savingEvent || loadingEvents}
              onPress={() => void handleOpenEvent(event.dbId)}
            />
          </View>
        ))}
      </SectionCard>

      <SectionCard title="Evento">
        <Text style={styles.title}>{draft.name}</Text>
        <Text style={styles.meta}>
          {draft.date} - {draft.pax} pax - {result.summary.totalBlocks} bloques - {eventTasks.length} tareas
        </Text>
        <View style={styles.inlineActions}>
          {!metreOnly ? (
            <PrimaryButton label="Configurar" variant="secondary" onPress={() => navigation.navigate("Configurator")} />
          ) : null}
          <PrimaryButton label="Diagrama" variant="secondary" onPress={() => navigation.navigate("Timeline")} />
        </View>
      </SectionCard>

      <SectionCard title="Resumen del evento" caption={`Base banquete: ${result.staffing.banquetBaseStaff} meseros`}>
        <View style={styles.summaryGrid}>
          <Metric label="Pico minimo" value={String(result.staffing.peakStaffMin)} />
          <Metric label="Bloques" value={String(result.summary.totalBlocks)} />
          <Metric label="Tareas" value={String(eventTasks.length)} />
          <Metric label="Logs" value={String(taskLogs.length)} />
        </View>
        <View style={[styles.momentGrid, wideWeb && styles.momentGridWide]}>
          {result.staffing.moments.map((moment) => (
            <View key={moment.moment} style={styles.momentRow}>
              <Text style={styles.title}>{moment.label}</Text>
              <Text style={styles.meta}>
                {moment.start ?? "--"}-{moment.end ?? "--"} - minimo pico {moment.peakStaffMin}
              </Text>
              {moment.rules[0] ? <Text style={styles.detail}>{moment.rules.slice(0, 2).join(" / ")}</Text> : null}
            </View>
          ))}
        </View>
        {result.staffing.warnings.length > 0 ? (
          <Text style={styles.warning}>{result.staffing.warnings.length} reglas de dotacion requieren revision.</Text>
        ) : null}
      </SectionCard>

      {eventId ? (
        <SectionCard title="Mover timeline" caption="Regenera horarios y conserva el estado de tareas existentes.">
          <View style={styles.inlineActions}>
            {[-10, 10, 15].map((minutes) => (
              <PrimaryButton
                key={minutes}
                label={`${minutes > 0 ? "+" : ""}${minutes} min`}
                icon={Clock}
                variant="secondary"
                loading={savingEvent}
                onPress={() => void handleShift(minutes)}
              />
            ))}
          </View>
          <View style={styles.shiftManual}>
            <Field
              label="Minutos"
              value={manualShiftMinutes}
              onChangeText={setManualShiftMinutes}
              keyboardType="numeric"
            />
            <PrimaryButton
              label="Mover"
              icon={Clock}
              loading={savingEvent}
              onPress={() => void handleShift(Number(manualShiftMinutes))}
            />
          </View>
        </SectionCard>
      ) : null}

      {eventId ? (
        <SectionCard title="Bloques operativos" caption="Completa todas las tareas activas de un bloque.">
          {result.blocks.length > visibleBlocks.length ? (
            <Text style={styles.empty}>Mostrando {visibleBlocks.length} de {result.blocks.length} bloques en movil.</Text>
          ) : null}
          {visibleBlocks.map((block) => {
            const blockTasks = tasksByBlock.get(block.id) ?? [];
            const activeTasks = blockTasks.filter((task) => task.status === "pending" || task.status === "in_progress");
            return (
              <View key={block.id} style={styles.blockRow}>
                <View style={styles.rowCopy}>
                  <Text style={styles.title}>{block.label}</Text>
                  <Text style={styles.meta}>
                    {block.start}-{block.end} - minimo {block.requiredStaffMin ?? 0} - {activeTasks.length}/{blockTasks.length} activas
                  </Text>
                </View>
                <PrimaryButton
                  label="Completar bloque"
                  icon={CheckCheck}
                  variant="secondary"
                  disabled={activeTasks.length === 0 || saving}
                  loading={saving}
                  onPress={() => void handleCompleteEventBlock(block.id)}
                />
              </View>
            );
          })}
        </SectionCard>
      ) : null}

      {!metreOnly ? <SectionCard title="Camareros activos" caption={loading ? "Cargando empleados..." : undefined}>
        {unassignedWaiters.length === 0 ? <Text style={styles.empty}>No hay camareros pendientes por asignar.</Text> : null}
        {unassignedWaiters.map((waiter) => (
          <View key={waiter.employeeId} style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.title}>{waiter.fullName}</Text>
              <Text style={styles.meta}>Nivel {waiter.skillLevel} - {waiter.roles.join(", ")}</Text>
            </View>
            <View style={styles.rowButtons}>
              <PrimaryButton
                label="T1"
                variant="secondary"
                disabled={!eventId || saving}
                onPress={() => void handleAddStaff(waiter, "T1")}
              />
              <PrimaryButton
                label="T2"
                variant="secondary"
                disabled={!eventId || saving}
                onPress={() => void handleAddStaff(waiter, "T2")}
              />
            </View>
          </View>
        ))}
      </SectionCard> : null}

      {!metreOnly ? <SectionCard title="Equipo del evento">
        {staff.length === 0 ? <Text style={styles.empty}>Aun no hay camareros asignados al evento.</Text> : null}
        {staff.map((assignment) => (
          <View key={assignment.id} style={styles.staffChip}>
            <Text style={styles.title}>{assignment.fullName}</Text>
            <Text style={styles.meta}>
              {assignment.shiftName}: {assignment.shiftStart}-{assignment.shiftEnd} - nivel {assignment.skillLevel}
            </Text>
          </View>
        ))}
      </SectionCard> : null}

      {!metreOnly ? <SectionCard title="Asignar bloques">
        {result.blocks.length > visibleBlocks.length ? (
          <Text style={styles.empty}>Mostrando {visibleBlocks.length} de {result.blocks.length} bloques.</Text>
        ) : null}
        {visibleBlocks.map((block) => (
          <View key={block.id} style={styles.blockRow}>
            <View style={styles.rowCopy}>
              <Text style={styles.title}>{block.label}</Text>
              <Text style={styles.meta}>
                {block.start}-{block.end} - {block.taskCount ?? 0} tareas - {block.team ?? "Equipo"}
              </Text>
            </View>
            <View style={styles.staffButtons}>
              {staff.map((assignment) => (
                <PrimaryButton
                  key={assignment.id}
                  label={assignment.fullName.split(" ")[0] ?? assignment.fullName}
                  variant="ghost"
                  disabled={!eventId || saving}
                  onPress={() => void handleAssignBlock(block.id, assignment)}
                />
              ))}
            </View>
          </View>
        ))}
      </SectionCard> : null}

      {!metreOnly ? <SectionCard title="Tareas internas" caption="Puedes asignar una tarea puntual ademas del bloque.">
        {eventTasks.length === 0 ? <Text style={styles.empty}>Guarda el evento para generar tareas del catalogo.</Text> : null}
        {eventTasks.length > visibleEventTasks.length ? (
          <Text style={styles.empty}>Mostrando {visibleEventTasks.length} de {eventTasks.length} tareas para evitar sobrecargar el movil.</Text>
        ) : null}
        {visibleEventTasks.map((task) => (
          <View key={task.id} style={styles.taskRow}>
            <Text style={styles.title}>{task.taskName}</Text>
            <Text style={styles.meta}>
              {task.blockLabel} - {task.startTime} - nivel {task.requiredLevel} - {task.status}
            </Text>
            {task.details ? <Text style={styles.detail}>{task.details}</Text> : null}
            <View style={styles.staffButtons}>
              {staff.map((assignment) => (
                <PrimaryButton
                  key={assignment.id}
                  label={assignment.fullName.split(" ")[0] ?? assignment.fullName}
                  variant="ghost"
                  disabled={saving}
                  onPress={() => void assignTask(task.id, assignment.id)}
                />
              ))}
            </View>
          </View>
        ))}
      </SectionCard> : null}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  metric: {
    minWidth: 120,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
  },
  metricValue: {
    color: colors.textStrong,
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  metricLabel: {
    color: colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  momentGrid: {
    gap: spacing.sm,
  },
  momentGridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  momentRow: {
    minWidth: 220,
    flex: 1,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.sm,
  },
  shiftManual: {
    alignItems: "flex-end",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
  },
  rowCopy: {
    flex: 1,
  },
  rowButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  staffChip: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
  },
  eventRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
  },
  blockRow: {
    gap: spacing.sm,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
  },
  taskRow: {
    gap: spacing.xs,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
  },
  staffButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  title: {
    color: colors.textStrong,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  meta: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  detail: {
    color: colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  warning: {
    color: colors.warning,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
});
