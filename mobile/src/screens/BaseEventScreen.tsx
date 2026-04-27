import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Save } from "lucide-react-native";
import { Field } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import type { RootStackParamList } from "../navigation/types";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "BaseEvent">;

export function BaseEventScreen({ navigation }: Props) {
  const { draft, result, saving, error, updateDraft, saveCurrent } = useTimelineStore();

  if (!draft) {
    return (
      <Screen title="Evento">
        <Text style={styles.empty}>Selecciona o crea un evento.</Text>
      </Screen>
    );
  }

  return (
    <Screen
      title="Datos base"
      subtitle={draft.name}
      footer={
        <View style={styles.footerButtons}>
          <PrimaryButton label="Modulos" onPress={() => navigation.navigate("Modules")} />
          <PrimaryButton
            label="Guardar"
            variant="secondary"
            icon={Save}
            loading={saving}
            onPress={() => void saveCurrent()}
          />
        </View>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <SectionCard title="Evento" caption="Estos datos alimentan la linea de tiempo y el snapshot cloud.">
        <Field label="Nombre" value={draft.name} onChangeText={(name) => updateDraft((event) => ({ ...event, name }))} />
        <Field label="Fecha" value={draft.date} onChangeText={(date) => updateDraft((event) => ({ ...event, date }))} />
        <Field
          label="Pax"
          value={String(draft.pax)}
          keyboardType="numeric"
          onChangeText={(pax) => updateDraft((event) => ({ ...event, pax: Number(pax) || 1 }))}
        />
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Field
              label="Apertura"
              value={draft.openDoorsTime}
              onChangeText={(openDoorsTime) => updateDraft((event) => ({ ...event, openDoorsTime }))}
            />
          </View>
          <View style={styles.rowItem}>
            <Field
              label="Fin"
              value={draft.endTime ?? ""}
              onChangeText={(endTime) => updateDraft((event) => ({ ...event, endTime }))}
            />
          </View>
        </View>
        <Field
          label="Notas"
          value={draft.notes ?? ""}
          multiline
          onChangeText={(notes) => updateDraft((event) => ({ ...event, notes }))}
        />
      </SectionCard>

      <SectionCard title="Resumen generado">
        <View style={styles.summaryGrid}>
          <Metric label="Bloques" value={String(result?.summary.totalBlocks ?? 0)} />
          <Metric label="Supuestos" value={String(result?.summary.assumptionCount ?? 0)} />
          <Metric label="Advertencias" value={String(result?.summary.warningCount ?? 0)} />
          <Metric label=">200 pax" value={draft.pax > 200 ? "Si" : "No"} />
        </View>
      </SectionCard>
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
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  rowItem: {
    flex: 1,
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

