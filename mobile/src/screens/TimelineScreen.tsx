import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import { TimelineGantt } from "../components/TimelineGantt";
import type { RootStackParamList } from "../navigation/types";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Timeline">;

export function TimelineScreen({ navigation }: Props) {
  const { draft, result, error, regenerate } = useTimelineStore();

  if (!draft || !result) {
    return (
      <Screen title="Timeline">
        <Text style={styles.empty}>Genera un evento primero.</Text>
      </Screen>
    );
  }

  return (
    <Screen
      title="Timeline"
      subtitle={`${result.summary.totalBlocks} bloques · ${result.summary.assumptionCount} supuestos`}
      footer={
        <View style={styles.footerButtons}>
          <PrimaryButton label="Volver" variant="secondary" onPress={() => navigation.navigate("Configurator")} />
          <PrimaryButton label="Regenerar" onPress={() => regenerate()} />
        </View>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionCard title="Vista Gantt" caption={`${result.summary.startsAt ?? "--"} a ${result.summary.endsAt ?? "--"}`}>
        <TimelineGantt blocks={result.blocks} anchor={draft.openDoorsTime} />
      </SectionCard>

      <SectionCard title="Totales">
        <View style={styles.summaryGrid}>
          <Metric label="Bloques" value={String(result.summary.totalBlocks)} />
          <Metric label="Modulos" value={String(result.summary.moduleCount)} />
          <Metric label="Supuestos" value={String(result.summary.assumptionCount)} />
          <Metric label="Advertencias" value={String(result.summary.warningCount)} />
        </View>
        {result.warnings.length > 0 ? (
          <Text style={styles.inlineNote}>Hay advertencias en la parte inferior para revisar horarios o solapes.</Text>
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
    gap: spacing.md,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
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
