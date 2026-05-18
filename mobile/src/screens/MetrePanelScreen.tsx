import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CheckCheck, Clock } from "lucide-react-native";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import { isMetre } from "../domain/assignments";
import type { RootStackParamList } from "../navigation/types";
import { useOperationsStore } from "../store/operationsStore";
import { useSessionStore } from "../store/sessionStore";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "MetrePanel">;

export function MetrePanelScreen({ navigation }: Props) {
  const [manualShiftMinutes, setManualShiftMinutes] = useState("10");
  const { width } = useWindowDimensions();
  const { session } = useSessionStore();
  const metreAccess = isMetre(session?.roles ?? []);
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
    shiftTimeline,
  } = useTimelineStore();
  const {
    eventTasks,
    taskLogs,
    saving,
    error,
    loadEventTasks,
    loadTaskLogs,
    clearEventContext,
    autoAssignBlocksForEvent,
    completeBlockForEvent,
  } = useOperationsStore();

  useEffect(() => {
    if (!draft) {
      createDraft();
    }
  }, [createDraft, draft]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (dbId) {
      void autoAssignBlocksForEvent(dbId);
      void loadEventTasks(dbId);
      void loadTaskLogs(dbId);
    }
  }, [autoAssignBlocksForEvent, dbId, loadEventTasks, loadTaskLogs]);

  const tasksByBlock = useMemo(() => {
    const groups = new Map<string, typeof eventTasks>();
    eventTasks.forEach((task) => {
      groups.set(task.blockKey, [...(groups.get(task.blockKey) ?? []), task]);
    });
    return groups;
  }, [eventTasks]);

  if (!metreAccess) {
    return (
      <Screen title="Panel metre">
        <Text style={styles.empty}>Tu rol actual no tiene acceso al panel metre.</Text>
      </Screen>
    );
  }

  if (!draft || !result) {
    return (
      <Screen title="Panel metre">
        <Text style={styles.empty}>Preparando evento...</Text>
      </Screen>
    );
  }

  async function handleOpenEvent(eventDbId: string) {
    clearEventContext();
    await openEvent(eventDbId);
    const openedDbId = useTimelineStore.getState().dbId;
    if (openedDbId) {
      await autoAssignBlocksForEvent(openedDbId);
      await loadEventTasks(openedDbId);
      await loadTaskLogs(openedDbId);
    }
  }

  async function handleCompleteEventBlock(blockKey: string) {
    const eventId = useTimelineStore.getState().dbId;
    if (!eventId) {
      Alert.alert("Evento sin guardar", "El evento debe estar guardado antes de completar bloques.");
      return;
    }
    await completeBlockForEvent(eventId, blockKey, session?.employeeId, "metre");
    await loadEventTasks(eventId);
    await loadTaskLogs(eventId);
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

  const savedEvents = events.filter((event) => event.hasTimelineSnapshot);
  const visibleBlocks = wideWeb ? result.blocks : result.blocks.slice(0, 40);

  return (
    <Screen
      title="Panel metre"
      subtitle={dbId ? `Evento abierto: ${draft.name}` : "Abre un evento guardado para operar."}
      footer={
        <View style={styles.footer}>
          <PrimaryButton label="Volver" variant="secondary" onPress={() => navigation.navigate("Home")} />
          <PrimaryButton label="Diagrama" variant="secondary" onPress={() => navigation.navigate("Timeline")} />
        </View>
      }
    >
      {timelineError || error ? <Text style={styles.error}>{timelineError ?? error}</Text> : null}

      <SectionCard title="Eventos guardados" caption={loadingEvents ? "Cargando eventos..." : undefined}>
        <View style={styles.inlineActions}>
          <PrimaryButton label="Refrescar" variant="secondary" onPress={() => void loadEvents()} />
        </View>
        {savedEvents.length === 0 ? (
          <Text style={styles.empty}>No hay eventos guardados listos para metre.</Text>
        ) : null}
        {savedEvents.slice(0, 12).map((event) => (
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

      <SectionCard title="Resumen operativo">
        <Text style={styles.title}>{draft.name}</Text>
        <Text style={styles.meta}>
          {draft.date} - {draft.pax} pax - {eventTasks.length} tareas - {taskLogs.length} logs
        </Text>
      </SectionCard>

      {dbId ? (
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

      {dbId ? (
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
    </Screen>
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
  shiftManual: {
    alignItems: "flex-end",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  rowCopy: {
    flex: 1,
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
});
