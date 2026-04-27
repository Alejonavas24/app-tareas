import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ToggleRow } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import type { RootStackParamList } from "../navigation/types";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Assumptions">;

export function AssumptionsScreen({ navigation }: Props) {
  const { result, saving, setAssumptionReviewed } = useTimelineStore();

  if (!result) {
    return (
      <Screen title="Supuestos">
        <Text style={styles.empty}>No hay supuestos generados.</Text>
      </Screen>
    );
  }

  return (
    <Screen
      title="Supuestos"
      subtitle="Validaciones y decisiones que conviene revisar"
      footer={<PrimaryButton label="Volver al timeline" onPress={() => navigation.navigate("Timeline")} />}
    >
      <SectionCard title="Lista">
        {result.assumptions.length === 0 ? <Text style={styles.empty}>Sin supuestos pendientes.</Text> : null}
        {result.assumptions.map((item) => (
          <View key={item.id} style={styles.assumption}>
            <ToggleRow
              label={item.label}
              caption={item.reviewed ? "Revisado" : "Pendiente"}
              value={Boolean(item.reviewed)}
              onValueChange={(reviewed) => void setAssumptionReviewed(item.id, reviewed)}
            />
            <Text style={styles.detail}>{item.detail}</Text>
            {item.source ? <Text style={styles.source}>{item.source}</Text> : null}
          </View>
        ))}
      </SectionCard>
      {saving ? <Text style={styles.saving}>Guardando revision...</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  assumption: {
    gap: spacing.xs,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
  },
  detail: {
    color: colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  source: {
    color: colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
  },
  saving: {
    color: colors.primary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
  },
});

