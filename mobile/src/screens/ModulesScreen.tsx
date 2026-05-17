import { Pressable, Text, View, StyleSheet } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ToggleRow } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import type { EventStand, StandMoment } from "../domain/types";
import type { RootStackParamList } from "../navigation/types";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Modules">;

const standOptions = [
  { id: "jamon_1x50", label: "Jamon" },
  { id: "jamon_2h", label: "Jamon 2h" },
  { id: "quesos_clasico", label: "Quesos clasico" },
  { id: "quesos_embutidos", label: "Quesos y embutidos" },
  { id: "croquetas", label: "Croquetas" },
  { id: "cerveza", label: "Cerveza" },
  { id: "arroz", label: "Arroz" },
  { id: "huevos", label: "Huevos" },
  { id: "mojitos", label: "Mojitos" },
  { id: "navajas_zamburinas", label: "Navajas/zamburinas" },
  { id: "sushi", label: "Sushi" },
  { id: "tortilla", label: "Tortilla" },
  { id: "vermut", label: "Vermut" },
] satisfies { id: EventStand["id"]; label: string }[];

const standMoments: { id: StandMoment; label: string }[] = [
  { id: "ceremony", label: "Ceremonia" },
  { id: "cocktail", label: "Coctel" },
  { id: "party", label: "Fiesta" },
];

export function ModulesScreen({ navigation }: Props) {
  const { draft, updateDraft } = useTimelineStore();

  if (!draft) {
    return (
      <Screen title="Modulos">
        <Text style={styles.empty}>Selecciona o crea un evento.</Text>
      </Screen>
    );
  }

  const updateStand = (standId: EventStand["id"], patch: Partial<Pick<EventStand, "enabled" | "moment">>) =>
    updateDraft((event) => ({
      ...event,
      stands: event.stands.map((stand) => (stand.id === standId ? { ...stand, ...patch } : stand)),
    }));

  return (
    <Screen
      title="Modulos"
      subtitle="Selecciona los bloques reales del evento"
      footer={<PrimaryButton label="Horarios" onPress={() => navigation.navigate("Schedule")} />}
    >
      <SectionCard title="Ceremonia">
        <ToggleRow
          label="Ceremonia"
          value={draft.ceremony.enabled}
          onValueChange={(enabled) => updateDraft((event) => ({ ...event, ceremony: { ...event.ceremony, enabled } }))}
        />
        <ToggleRow
          label="Civil"
          value={Boolean(draft.ceremony.civil)}
          onValueChange={(civil) => updateDraft((event) => ({ ...event, ceremony: { ...event.ceremony, civil } }))}
        />
        <ToggleRow
          label="Limonada"
          value={Boolean(draft.ceremony.limonada)}
          onValueChange={(limonada) =>
            updateDraft((event) => ({ ...event, ceremony: { ...event.ceremony, limonada } }))
          }
        />
      </SectionCard>

      <SectionCard title="Coctel y puestos">
        <ToggleRow
          label="Coctel"
          value={draft.cocktail.enabled}
          onValueChange={(enabled) => updateDraft((event) => ({ ...event, cocktail: { ...event.cocktail, enabled } }))}
        />
        {standOptions.map((option) => (
          <StandConfigRow
            key={option.id}
            label={option.label}
            stand={draft.stands.find((stand) => stand.id === option.id)}
            onToggle={(enabled) => updateStand(option.id, { enabled })}
            onMoment={(moment) => updateStand(option.id, { moment })}
          />
        ))}
      </SectionCard>

      <SectionCard title="Banquete, fiesta y resopon">
        <ToggleRow
          label="Banquete"
          value={draft.banquet.enabled}
          onValueChange={(enabled) => updateDraft((event) => ({ ...event, banquet: { ...event.banquet, enabled } }))}
        />
        <ToggleRow
          label="Tarta"
          value={Boolean(draft.banquet.cake)}
          onValueChange={(cake) => updateDraft((event) => ({ ...event, banquet: { ...event.banquet, cake } }))}
        />
        <ToggleRow
          label="Fiesta"
          value={draft.party.enabled}
          onValueChange={(enabled) => updateDraft((event) => ({ ...event, party: { ...event.party, enabled } }))}
        />
        <ToggleRow
          label="Resopon"
          value={draft.resopon.enabled}
          onValueChange={(enabled) => updateDraft((event) => ({ ...event, resopon: { ...event.resopon, enabled } }))}
        />
        <View style={styles.paxBanner}>
          <Text style={styles.paxText}>
            {draft.pax > 200 ? "Regla >200 pax activa automaticamente." : "Regla >200 pax inactiva."}
          </Text>
        </View>
      </SectionCard>
    </Screen>
  );
}

function StandConfigRow({
  label,
  stand,
  onToggle,
  onMoment,
}: {
  label: string;
  stand?: EventStand;
  onToggle: (enabled: boolean) => void;
  onMoment: (moment: StandMoment) => void;
}) {
  const enabled = Boolean(stand?.enabled);
  const moment = stand?.moment ?? "cocktail";
  return (
    <View style={styles.standRow}>
      <ToggleRow
        label={label}
        value={enabled}
        onValueChange={onToggle}
        caption={enabled ? standMoments.find((item) => item.id === moment)?.label : undefined}
      />
      {enabled ? (
        <View style={styles.segmented}>
          {standMoments.map((item) => {
            const selected = item.id === moment;
            return (
              <Pressable
                accessibilityRole="button"
                key={item.id}
                onPress={() => onMoment(item.id)}
                style={[styles.segmentButton, selected && styles.segmentButtonActive]}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
  },
  paxBanner: {
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
  },
  paxText: {
    color: colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  standRow: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  segmented: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  segmentButton: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderColor: colors.line,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
  },
  segmentButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  segmentText: {
    color: colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  segmentTextActive: {
    color: colors.textStrong,
  },
});
