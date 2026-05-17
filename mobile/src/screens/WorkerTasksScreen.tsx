import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Check, CheckCheck, Play } from "lucide-react-native";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import type { WorkerTask } from "../domain/types";
import type { RootStackParamList } from "../navigation/types";
import { useOperationsStore } from "../store/operationsStore";
import { useSessionStore } from "../store/sessionStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "WorkerTasks">;

interface BlockTaskGroup {
  blockKey: string;
  blockLabel: string;
  tasks: WorkerTask[];
}

interface EventTaskGroup {
  eventId: string;
  eventName: string;
  eventDate: string;
  blocks: BlockTaskGroup[];
}

function groupTasksByEvent(tasks: WorkerTask[]): EventTaskGroup[] {
  const events = new Map<string, EventTaskGroup>();

  tasks.forEach((task) => {
    const eventGroup =
      events.get(task.eventId) ??
      ({
        eventId: task.eventId,
        eventName: task.eventName,
        eventDate: task.eventDate,
        blocks: [],
      } satisfies EventTaskGroup);

    if (!events.has(task.eventId)) {
      events.set(task.eventId, eventGroup);
    }

    let blockGroup = eventGroup.blocks.find((block) => block.blockKey === task.blockKey);
    if (!blockGroup) {
      blockGroup = {
        blockKey: task.blockKey,
        blockLabel: task.blockLabel ?? task.blockKey,
        tasks: [],
      };
      eventGroup.blocks.push(blockGroup);
    }

    blockGroup.tasks.push(task);
  });

  return Array.from(events.values());
}

function getStatusLabel(status: WorkerTask["status"]) {
  if (status === "pending") {
    return "Pendiente";
  }
  if (status === "in_progress") {
    return "En curso";
  }
  if (status === "completed") {
    return "Completada";
  }
  return "Cancelada";
}

export function WorkerTasksScreen({ navigation }: Props) {
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const [blockIndexByEvent, setBlockIndexByEvent] = useState<Record<string, number>>({});
  const { session } = useSessionStore();
  const {
    workerTasks,
    loading,
    saving,
    error,
    loadTasksForEmployee,
    startTaskForEmployee,
    completeTaskForEmployee,
    completeBlockForWorker,
  } = useOperationsStore();
  const eventGroups = useMemo(() => groupTasksByEvent(workerTasks), [workerTasks]);
  const selectedEvent = eventGroups.find((event) => event.eventId === selectedEventId) ?? eventGroups[0];
  const selectedBlockIndex = selectedEvent
    ? Math.min(blockIndexByEvent[selectedEvent.eventId] ?? 0, Math.max(selectedEvent.blocks.length - 1, 0))
    : 0;
  const selectedBlock = selectedEvent?.blocks[selectedBlockIndex];

  useEffect(() => {
    if (session?.employeeId) {
      void loadTasksForEmployee(session.employeeId, includeCompleted);
    }
  }, [includeCompleted, loadTasksForEmployee, session?.employeeId]);

  useEffect(() => {
    if (!selectedEventId && eventGroups[0]) {
      setSelectedEventId(eventGroups[0].eventId);
    }
    if (selectedEventId && !eventGroups.some((event) => event.eventId === selectedEventId)) {
      setSelectedEventId(eventGroups[0]?.eventId);
    }
  }, [eventGroups, selectedEventId]);

  if (!session) {
    return (
      <Screen title="Mis tareas">
        <Text style={styles.empty}>No hay sesion validada.</Text>
      </Screen>
    );
  }

  return (
    <Screen
      title="Mis tareas"
      subtitle={session.fullName}
      footer={
        <View style={styles.footer}>
          <PrimaryButton label="Volver" variant="secondary" onPress={() => navigation.navigate("Home")} />
          <PrimaryButton
            label={includeCompleted ? "Pendientes" : "Todas"}
            variant="secondary"
            onPress={() => setIncludeCompleted((value) => !value)}
          />
          <PrimaryButton
            label="Refrescar"
            variant="secondary"
            onPress={() => void loadTasksForEmployee(session.employeeId, includeCompleted)}
          />
        </View>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionCard title="Asignadas" caption={loading ? "Actualizando..." : `${workerTasks.length} tareas`}>
        {workerTasks.length === 0 ? <Text style={styles.empty}>No tienes tareas pendientes asignadas.</Text> : null}

        {eventGroups.length > 1 ? (
          <View style={styles.eventPicker}>
            {eventGroups.map((event) => {
              const isSelected = event.eventId === selectedEvent?.eventId;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={event.eventId}
                  onPress={() => setSelectedEventId(event.eventId)}
                  style={[styles.eventChip, isSelected && styles.eventChipSelected]}
                >
                  <Text style={[styles.eventChipText, isSelected && styles.eventChipTextSelected]}>
                    {event.eventName}
                  </Text>
                  <Text style={[styles.eventChipMeta, isSelected && styles.eventChipTextSelected]}>
                    {event.blocks.length} bloques
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {selectedEvent && selectedBlock ? (
          <View style={styles.blockPanel}>
            <View style={styles.blockTop}>
              <View style={styles.rowCopy}>
                <Text style={styles.eventTitle}>{selectedEvent.eventName}</Text>
                <Text style={styles.meta}>
                  {selectedEvent.eventDate} - bloque {selectedBlockIndex + 1} de {selectedEvent.blocks.length}
                </Text>
              </View>
              <View style={styles.blockNav}>
                <PrimaryButton
                  label="Anterior"
                  variant="secondary"
                  disabled={selectedBlockIndex === 0}
                  onPress={() =>
                    setBlockIndexByEvent((state) => ({
                      ...state,
                      [selectedEvent.eventId]: Math.max(selectedBlockIndex - 1, 0),
                    }))
                  }
                />
                <PrimaryButton
                  label="Siguiente"
                  variant="secondary"
                  disabled={selectedBlockIndex >= selectedEvent.blocks.length - 1}
                  onPress={() =>
                    setBlockIndexByEvent((state) => ({
                      ...state,
                      [selectedEvent.eventId]: Math.min(selectedBlockIndex + 1, selectedEvent.blocks.length - 1),
                    }))
                  }
                />
              </View>
            </View>

            <View style={styles.blockHeader}>
              <View style={styles.rowCopy}>
                <Text style={styles.blockTitle}>{selectedBlock.blockLabel}</Text>
                <Text style={styles.assignment}>{selectedBlock.tasks.length} tareas en este bloque</Text>
              </View>
              <PrimaryButton
                label="Terminar bloque"
                icon={CheckCheck}
                variant="secondary"
                loading={saving}
                disabled={!selectedBlock.tasks.some((task) => task.status === "pending" || task.status === "in_progress")}
                onPress={() =>
                  void completeBlockForWorker(
                    selectedEvent.eventId,
                    selectedBlock.blockKey,
                    session.employeeId,
                    includeCompleted,
                  )
                }
              />
            </View>

            {selectedBlock.tasks.map((task) => (
              <View key={task.id} style={styles.taskRow}>
                <View style={styles.taskHeader}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.taskTitle}>{task.taskName}</Text>
                    <Text style={styles.time}>
                      Inicio {task.startTime} - {task.endTime} - {getStatusLabel(task.status)}
                    </Text>
                  </View>
                  {task.status === "pending" ? (
                    <PrimaryButton
                      label="Iniciar"
                      icon={Play}
                      loading={saving}
                      onPress={() => void startTaskForEmployee(task.id, session.employeeId)}
                    />
                  ) : null}
                  {task.status === "in_progress" ? (
                    <PrimaryButton
                      label="Terminar"
                      icon={Check}
                      loading={saving}
                      onPress={() => void completeTaskForEmployee(task.id, session.employeeId, includeCompleted)}
                    />
                  ) : null}
                </View>
                {task.details ? <Text style={styles.detail}>{task.details}</Text> : null}
                <Text style={styles.assignment}>
                  {task.assignedDirectly ? "Asignada puntual" : "Asignada por bloque"} - nivel {task.requiredLevel}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  taskRow: {
    gap: spacing.sm,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
  },
  blockHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  blockNav: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  blockPanel: {
    gap: spacing.md,
  },
  blockTitle: {
    color: colors.textStrong,
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
  },
  blockTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  eventChip: {
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 132,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  eventChipMeta: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  eventChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  eventChipText: {
    color: colors.textStrong,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  eventChipTextSelected: {
    color: colors.white,
  },
  eventPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  eventTitle: {
    color: colors.textStrong,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  taskHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  rowCopy: {
    flex: 1,
  },
  taskTitle: {
    color: colors.textStrong,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  meta: {
    color: colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  time: {
    color: colors.primary,
    fontFamily: "Inter_600SemiBold",
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
  assignment: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
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
