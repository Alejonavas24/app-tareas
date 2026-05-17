import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FileDown, Save } from "lucide-react-native";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import { TimelineGantt } from "../components/TimelineGantt";
import { TimelineGrid } from "../components/TimelineGrid";
import type { RootStackParamList } from "../navigation/types";
import { exportTimelinePdf } from "../services/pdfExport";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";
import type { EventConfig, TimelineResult } from "../domain/types";

type Props = NativeStackScreenProps<RootStackParamList, "Timeline">;

export function TimelineScreen({ navigation }: Props) {
  const [viewMode, setViewMode] = useState<"grid" | "gantt">("grid");
  const [exportingPdf, setExportingPdf] = useState(false);
  const { draft, result, error, saving, regenerate, saveCurrentWithTasks } = useTimelineStore();

  if (!draft || !result) {
    return (
      <Screen title="Timeline">
        <Text style={styles.empty}>Genera un evento primero.</Text>
      </Screen>
    );
  }

  async function handleExportPdf(currentDraft: EventConfig, currentResult: TimelineResult) {
    setExportingPdf(true);
    try {
      const uri = await exportTimelinePdf(currentDraft, currentResult);
      Alert.alert("PDF generado", `Archivo listo: ${uri}`);
    } catch (exportError) {
      Alert.alert("No se pudo exportar", (exportError as Error).message);
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleSaveEvent() {
    regenerate();
    const saved = await saveCurrentWithTasks();
    if (saved?.dbId) {
      Alert.alert("Evento guardado", "El evento quedo guardado y las tareas fueron generadas.");
    } else {
      Alert.alert("No se pudo guardar", useTimelineStore.getState().error ?? "Revisa la conexion con Supabase.");
    }
  }

  return (
    <Screen
      title="Timeline"
      subtitle={`${result.summary.totalBlocks} bloques - ${result.summary.assumptionCount} supuestos`}
      footer={
        <View style={styles.footerButtons}>
          <PrimaryButton
            label="Volver"
            variant="secondary"
            onPress={() => navigation.reset({ index: 0, routes: [{ name: "AdminPanel" }] })}
          />
          <PrimaryButton
            label="PDF"
            variant="secondary"
            icon={FileDown}
            loading={exportingPdf}
            onPress={() => void handleExportPdf(draft, result)}
          />
          <PrimaryButton
            label="Guardar evento"
            variant="secondary"
            icon={Save}
            loading={saving}
            onPress={() => void handleSaveEvent()}
          />
          <PrimaryButton label="Regenerar" onPress={() => regenerate()} />
        </View>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionCard
        title={viewMode === "grid" ? "Grilla operativa" : "Vista Gantt"}
        caption={`${result.summary.startsAt ?? "--"} a ${result.summary.endsAt ?? "--"}`}
      >
        <View style={styles.viewToggle}>
          <PrimaryButton
            label="Grilla"
            variant={viewMode === "grid" ? "primary" : "secondary"}
            onPress={() => setViewMode("grid")}
          />
          <PrimaryButton
            label="Gantt"
            variant={viewMode === "gantt" ? "primary" : "secondary"}
            onPress={() => setViewMode("gantt")}
          />
        </View>
        {viewMode === "grid" ? (
          <TimelineGrid blocks={result.blocks} anchor={draft.openDoorsTime} />
        ) : (
          <TimelineGantt blocks={result.blocks} anchor={draft.openDoorsTime} />
        )}
      </SectionCard>

      <SectionCard title="Totales">
        <View style={styles.summaryGrid}>
          <Metric label="Bloques" value={String(result.summary.totalBlocks)} />
          <Metric label="Modulos" value={String(result.summary.moduleCount)} />
          <Metric label="Supuestos" value={String(result.summary.assumptionCount)} />
          <Metric label="Advertencias" value={String(result.summary.warningCount)} />
        </View>
        {result.warnings.length > 0 ? (
          <Text style={styles.inlineNote}>Hay advertencias al final para revisar horarios y transiciones.</Text>
        ) : null}
      </SectionCard>

      {result.assumptions.length > 0 ? (
        <SectionCard title="Supuestos del motor">
          {result.assumptions.map((item) => (
            <Text key={item.id} style={styles.assumption}>
              {item.label}: {item.detail}
            </Text>
          ))}
        </SectionCard>
      ) : null}

      {result.warnings.length > 0 ? (
        <SectionCard title="Advertencias">
          {result.warnings.map((warning) => (
            <Text key={warning} style={styles.warning}>
              {warning}
            </Text>
          ))}
        </SectionCard>
      ) : null}
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
  footerButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  viewToggle: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metric: {
    minWidth: "45%",
    borderRadius: 12,
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
  inlineNote: {
    color: colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: spacing.md,
  },
  assumption: {
    color: colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    color: colors.warning,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
  },
  error: {
    color: colors.danger,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
});
