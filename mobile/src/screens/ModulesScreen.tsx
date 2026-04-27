import { Text, View, StyleSheet } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ToggleRow } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import type { RootStackParamList } from "../navigation/types";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Modules">;

const standOptions = [
  { id: "jamon_1x50", label: "Jamon" },
  { id: "quesos_clasico", label: "Quesos clasico" },
  { id: "croquetas", label: "Croquetas" },
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

  const updateStands = (standId: string, enabled: boolean) => {
    updateDraft((event) => {
      const current = new Set(event.cocktail.stands ?? []);
      if (enabled) {
        current.add(standId);
      } else {
        current.delete(standId);
      }
      return { ...event, cocktail: { ...event.cocktail, stands: Array.from(current) } };
    });
  };

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
        <ToggleRow
          label="Puesto cerveza"
          value={Boolean(draft.ceremony.beerStand)}
          onValueChange={(beerStand) =>
            updateDraft((event) => ({ ...event, ceremony: { ...event.ceremony, beerStand } }))
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
          <ToggleRow
            key={option.id}
            label={option.label}
            value={draft.cocktail.stands.includes(option.id)}
            onValueChange={(enabled) => updateStands(option.id, enabled)}
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
});

