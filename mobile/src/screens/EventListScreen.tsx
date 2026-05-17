import { useCallback } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CalendarDays, Copy, Plus, Trash2 } from "lucide-react-native";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import type { RootStackParamList } from "../navigation/types";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Events">;

export function EventListScreen({ navigation }: Props) {
  const { events, loading, error, loadEvents, createDraft, openEvent, deleteEvent } =
    useTimelineStore();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let refreshing = false;

      const refresh = async () => {
        if (!active || refreshing) {
          return;
        }
        refreshing = true;
        try {
          await loadEvents();
        } finally {
          refreshing = false;
        }
      };

      void refresh();
      const interval = setInterval(() => {
        void refresh();
      }, 20000);

      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [loadEvents]),
  );

  const openDbEvent = useCallback(
    async (dbId: string) => {
      await openEvent(dbId);
      navigation.navigate("BaseEvent");
    },
    [navigation, openEvent],
  );

  return (
    <Screen
      title="Linea de tiempo"
      subtitle="Eventos sincronizados desde CRM"
      footer={
        <PrimaryButton
          label="Crear evento"
          icon={Plus}
          onPress={() => {
            createDraft();
            navigation.navigate("BaseEvent");
          }}
        />
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionCard title="CRM" caption="Lista actual desde list_planner_events.">
        <ScrollView
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadEvents} tintColor={colors.primary} />}
          scrollEnabled={false}
          contentContainerStyle={styles.list}
        >
          {events.length === 0 ? <Text style={styles.empty}>No hay eventos CRM en el rango actual.</Text> : null}
          {events.map((event) => (
            <View key={event.dbId} style={styles.eventCard}>
              <View style={styles.eventHeader}>
                <View style={styles.eventIcon}>
                  <CalendarDays color={colors.primary} size={18} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.eventName}>{event.name}</Text>
                  <Text style={styles.meta}>
                    {event.date} - {event.pax} pax
                    {event.venueName ? ` - ${event.venueName}` : ""}
                    {event.hasTimelineSnapshot ? ` - ${event.summary?.totalBlocks ?? 0} bloques` : " - sin timeline"}
                  </Text>
                  {event.planningStatus ? (
                    <Text style={event.inventoryBreak ? styles.warningMeta : styles.meta}>
                      {event.planningStatus}
                      {event.inventoryBreak ? " - ruptura inventario" : ""}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.actions}>
                <PrimaryButton label="Abrir" variant="secondary" onPress={() => void openDbEvent(event.dbId)} />
                <PrimaryButton
                  label="Duplicar"
                  variant="ghost"
                  icon={Copy}
                  onPress={async () => {
                    await openEvent(event.dbId);
                    useTimelineStore.getState().duplicateCurrent();
                    navigation.navigate("BaseEvent");
                  }}
                />
                <PrimaryButton
                  label="Borrar"
                  variant="ghost"
                  icon={Trash2}
                  disabled={!event.hasTimelineSnapshot}
                  onPress={() =>
                    Alert.alert("Borrar evento", `Eliminar ${event.name}?`, [
                      { text: "Cancelar", style: "cancel" },
                      { text: "Borrar", style: "destructive", onPress: () => void deleteEvent(event.dbId) },
                    ])
                  }
                />
              </View>
            </View>
          ))}
        </ScrollView>
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  eventCard: {
    gap: spacing.md,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
  },
  eventHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  eventIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
  },
  rowCopy: {
    flex: 1,
  },
  eventName: {
    color: colors.textStrong,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  meta: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  warningMeta: {
    color: colors.warning,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  error: {
    color: colors.danger,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
});
