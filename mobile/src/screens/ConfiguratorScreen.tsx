import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Field, ToggleRow } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import { addMinutes } from "../domain/time";
import type { EventConfig } from "../domain/types";
import type { RootStackParamList } from "../navigation/types";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Configurator">;

const STAND_OPTIONS = [
  { id: "jamon_1x50", label: "Jamon" },
  { id: "quesos_clasico", label: "Quesos" },
  { id: "croquetas", label: "Croquetas" },
];

function banquetDuration(event: EventConfig): number {
  return event.banquet.segments.reduce((sum, segment) => sum + segment.minutes, 0) + (event.banquet.momentsExtraMinutes ?? 0);
}

function partyDuration(event: EventConfig): number {
  return event.party.totalMinutes ?? 300;
}

export function ConfiguratorScreen({ navigation }: Props) {
  const { draft, createDraft, updateDraft, regenerate, result } = useTimelineStore();

  useEffect(() => {
    if (!draft) {
      createDraft();
    }
  }, [createDraft, draft]);

  if (!draft) {
    return (
      <Screen title="Configurador">
        <Text style={styles.empty}>Preparando configuracion...</Text>
      </Screen>
    );
  }

  const setCeremonyStart = (start: string) =>
    updateDraft((event) => ({
      ...event,
      ceremony: {
        ...event.ceremony,
        start,
        end: addMinutes(start, 45),
      },
    }));

  const setCocktailStart = (start: string) =>
    updateDraft((event) => ({
      ...event,
      cocktail: {
        ...event.cocktail,
        start,
        end: addMinutes(start, 60),
      },
    }));

  const setBanquetStart = (start: string) =>
    updateDraft((event) => ({
      ...event,
      banquet: {
        ...event.banquet,
        start,
        end: addMinutes(start, banquetDuration(event)),
      },
    }));

  const setPartyStart = (start: string) =>
    updateDraft((event) => ({
      ...event,
      party: {
        ...event.party,
        segments: [
          {
            name: event.party.segments[0]?.name ?? "fiesta",
            start,
            end: addMinutes(start, partyDuration(event)),
          },
        ],
      },
    }));

  const setResoponStart = (start: string) =>
    updateDraft((event) => ({
      ...event,
      resopon: {
        ...event.resopon,
        serviceWindow: [start, start],
      },
    }));

  const toggleStand = (standId: string, enabled: boolean) =>
    updateDraft((event) => {
      const current = new Set(event.cocktail.stands);
      if (enabled) {
        current.add(standId);
      } else {
        current.delete(standId);
      }
      return {
        ...event,
        cocktail: {
          ...event.cocktail,
          stands: Array.from(current),
        },
      };
    });

  return (
    <Screen
      title="Momentos de la boda"
      subtitle="Activa los momentos, pon la hora de inicio y genera el Gantt."
      footer={
        <View style={styles.footer}>
          <PrimaryButton
            label="Generar diagrama"
            onPress={() => {
              regenerate();
              navigation.navigate("Timeline");
            }}
          />
        </View>
      }
    >
      <SectionCard title="Evento">
        <Field
          label="Nombre del evento"
          value={draft.name}
          onChangeText={(name) => updateDraft((event) => ({ ...event, name }))}
        />
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Field
              label="Fecha"
              value={draft.date}
              onChangeText={(date) => updateDraft((event) => ({ ...event, date }))}
            />
          </View>
          <View style={styles.rowItem}>
            <Field
              label="Pax"
              value={String(draft.pax)}
              keyboardType="numeric"
              onChangeText={(pax) => updateDraft((event) => ({ ...event, pax: Number(pax) || 1 }))}
            />
          </View>
        </View>
        <Field
          label="Apertura de puertas"
          value={draft.openDoorsTime}
          onChangeText={(openDoorsTime) => updateDraft((event) => ({ ...event, openDoorsTime }))}
        />
      </SectionCard>

      <SectionCard title="Momentos">
        <MomentRow
          label="Ceremonia civil"
          enabled={draft.ceremony.enabled}
          start={draft.ceremony.start ?? ""}
          onToggle={(enabled) => updateDraft((event) => ({ ...event, ceremony: { ...event.ceremony, enabled } }))}
          onStartChange={setCeremonyStart}
        />
        <MomentRow
          label="Puesto de limonada"
          enabled={Boolean(draft.ceremony.limonada)}
          start={draft.ceremony.start ?? ""}
          onToggle={(limonada) => updateDraft((event) => ({ ...event, ceremony: { ...event.ceremony, limonada } }))}
          onStartChange={setCeremonyStart}
        />
        <MomentRow
          label="Coctel"
          enabled={draft.cocktail.enabled}
          start={draft.cocktail.start ?? ""}
          onToggle={(enabled) => updateDraft((event) => ({ ...event, cocktail: { ...event.cocktail, enabled } }))}
          onStartChange={setCocktailStart}
        />
        <MomentRow
          label="Banquete"
          enabled={draft.banquet.enabled}
          start={draft.banquet.start ?? ""}
          onToggle={(enabled) => updateDraft((event) => ({ ...event, banquet: { ...event.banquet, enabled } }))}
          onStartChange={setBanquetStart}
        />
        <MomentRow
          label="Fiesta"
          enabled={draft.party.enabled}
          start={draft.party.segments[0]?.start ?? ""}
          onToggle={(enabled) => updateDraft((event) => ({ ...event, party: { ...event.party, enabled } }))}
          onStartChange={setPartyStart}
        />
        <MomentRow
          label="Resopon"
          enabled={draft.resopon.enabled}
          start={draft.resopon.serviceWindow?.[0] ?? ""}
          onToggle={(enabled) => updateDraft((event) => ({ ...event, resopon: { ...event.resopon, enabled } }))}
          onStartChange={setResoponStart}
        />
      </SectionCard>

      <SectionCard title="Puestos del coctel" caption="Solo si quieres incluirlos en el diagrama.">
        <ToggleRow
          label="Puesto cerveza"
          value={Boolean(draft.ceremony.beerStand)}
          onValueChange={(beerStand) =>
            updateDraft((event) => ({ ...event, ceremony: { ...event.ceremony, beerStand } }))
          }
        />
        {STAND_OPTIONS.map((option) => (
          <ToggleRow
            key={option.id}
            label={option.label}
            value={draft.cocktail.stands.includes(option.id)}
            onValueChange={(enabled) => toggleStand(option.id, enabled)}
          />
        ))}
      </SectionCard>

      <SectionCard title="Vista rapida">
        <View style={styles.quickStats}>
          <QuickStat label="Bloques" value={String(result?.summary.totalBlocks ?? 0)} />
          <QuickStat label="Supuestos" value={String(result?.summary.assumptionCount ?? 0)} />
          <QuickStat label="Advertencias" value={String(result?.summary.warningCount ?? 0)} />
          <QuickStat label=">200 pax" value={draft.pax > 200 ? "Si" : "No"} />
        </View>
      </SectionCard>
    </Screen>
  );
}

function MomentRow({
  label,
  enabled,
  start,
  onToggle,
  onStartChange,
}: {
  label: string;
  enabled: boolean;
  start: string;
  onToggle: (value: boolean) => void;
  onStartChange: (value: string) => void;
}) {
  return (
    <View style={styles.momentRow}>
      <ToggleRow label={label} value={enabled} onValueChange={onToggle} />
      {enabled ? <Field label="Hora inicio" value={start} onChangeText={onStartChange} /> : null}
    </View>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
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
  momentRow: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  quickStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  stat: {
    minWidth: "45%",
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
  },
  statValue: {
    color: colors.textStrong,
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  statLabel: {
    color: colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
  },
});

