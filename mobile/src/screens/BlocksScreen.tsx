import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import type { RootStackParamList } from "../navigation/types";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Blocks">;

export function BlocksScreen({ navigation }: Props) {
  const { result } = useTimelineStore();

  if (!result) {
    return (
      <Screen title="Bloques">
        <Text style={styles.empty}>No hay timeline generado.</Text>
      </Screen>
    );
  }

  return (
    <Screen
      title="Bloques aplicados"
      subtitle={`${result.appliedBlocks.length} referencias de catalogo`}
      footer={<PrimaryButton label="Supuestos" onPress={() => navigation.navigate("Assumptions")} />}
    >
      <SectionCard title="Referencias">
        <Text style={styles.referenceText}>{result.appliedBlocks.join(" · ")}</Text>
      </SectionCard>

      <SectionCard title="Detalle">
        {result.blocks.map((block) => (
          <View key={block.id} style={styles.blockRow}>
            <View style={[styles.phaseDot, { backgroundColor: colors.phase[block.phase] ?? colors.primary }]} />
            <View style={styles.blockCopy}>
              <Text style={styles.blockTitle}>{block.label}</Text>
              <Text style={styles.blockMeta}>
                {block.phase} · {block.start}-{block.end} · {block.durationMinutes} min
              </Text>
              {block.notes ? <Text style={styles.notes}>{block.notes}</Text> : null}
              {block.overlapsWith?.length ? (
                <Text style={styles.overlap}>Solapa con {block.overlapsWith.length} bloque(s)</Text>
              ) : null}
            </View>
          </View>
        ))}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  referenceText: {
    color: colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    lineHeight: 20,
  },
  blockRow: {
    flexDirection: "row",
    gap: spacing.md,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
  },
  phaseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  blockCopy: {
    flex: 1,
  },
  blockTitle: {
    color: colors.textStrong,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  blockMeta: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  notes: {
    color: colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  overlap: {
    color: colors.primary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginTop: spacing.xs,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
  },
});

