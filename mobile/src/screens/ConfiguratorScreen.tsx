import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Field, ToggleRow } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import { TimeSelect } from "../components/TimeSelect";
import { BANQUET_SEGMENT_OPTIONS, buildBanquetSegments } from "../domain/defaults";
import type { BanquetSegmentName, EventStand, StandMoment } from "../domain/types";
import type { RootStackParamList } from "../navigation/types";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Configurator">;

const STAND_OPTIONS = [
  { id: "jamon_1x50", label: "Jamon" },
  { id: "quesos_clasico", label: "Quesos" },
  { id: "croquetas", label: "Croquetas" },
  { id: "cerveza", label: "Cerveza" },
] satisfies { id: EventStand["id"]; label: string }[];

const STAND_MOMENTS: { id: StandMoment; label: string }[] = [
  { id: "ceremony", label: "Ceremonia" },
  { id: "cocktail", label: "Coctel" },
  { id: "party", label: "Fiesta" },
];

export function ConfiguratorScreen({ navigation }: Props) {
  const { draft, createDraft, updateDraft, regenerate, result, loadCatalog, catalogSource } = useTimelineStore();

  useEffect(() => {
    if (!draft) {
      createDraft();
    }
  }, [createDraft, draft]);

  useEffect(() => {
    if (draft) {
      void loadCatalog();
    }
  }, [draft?.id, loadCatalog]);

  if (!draft) {
    return (
      <Screen title="Configurador">
        <Text style={styles.empty}>Preparando configuracion...</Text>
      </Screen>
    );
  }

  const updateStand = (standId: EventStand["id"], patch: Partial<Pick<EventStand, "enabled" | "moment">>) =>
    updateDraft((event) => {
      return {
        ...event,
        stands: event.stands.map((stand) => (stand.id === standId ? { ...stand, ...patch } : stand)),
      };
    });

  const toggleBanquetSegment = (name: BanquetSegmentName, enabled: boolean) =>
    updateDraft((event) => {
      const active = new Set(event.banquet.segments.map((segment) => segment.name));
      if (enabled) {
        active.add(name);
      } else {
        active.delete(name);
      }
      return {
        ...event,
        banquet: {
          ...event.banquet,
          segments: buildBanquetSegments(Array.from(active), event.pax),
        },
      };
    });

  return (
    <Screen
      title="Momentos de la boda"
      subtitle="Activa los momentos, pon la hora inicial y genera el Gantt."
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
              onChangeText={(pax) => {
                const nextPax = Number(pax) || 1;
                updateDraft((event) => ({
                  ...event,
                  pax: nextPax,
                  banquet: {
                    ...event.banquet,
                    segments: buildBanquetSegments(
                      event.banquet.segments.map((segment) => segment.name),
                      nextPax,
                    ),
                  },
                }));
              }}
            />
          </View>
        </View>
        <TimeSelect
          label="Inicio operativo"
          value={draft.openDoorsTime}
          onValueChange={(openDoorsTime) => updateDraft((event) => ({ ...event, openDoorsTime }))}
        />
      </SectionCard>

      <SectionCard title="Momentos">
        <MomentRow
          label="Ceremonia civil"
          enabled={draft.ceremony.enabled}
          caption={`${draft.ceremony.start ?? "--"} - ${draft.ceremony.end ?? "--"}`}
          onToggle={(enabled) => updateDraft((event) => ({ ...event, ceremony: { ...event.ceremony, enabled } }))}
        />
        <MomentRow
          label="Puesto de limonada"
          enabled={Boolean(draft.ceremony.limonada)}
          caption={`${draft.ceremony.start ?? "--"} - ${draft.ceremony.end ?? "--"}`}
          onToggle={(limonada) => updateDraft((event) => ({ ...event, ceremony: { ...event.ceremony, limonada } }))}
        />
        <MomentRow
          label="Coctel"
          enabled={draft.cocktail.enabled}
          caption={`${draft.cocktail.start ?? "--"} - ${draft.cocktail.end ?? "--"}`}
          onToggle={(enabled) => updateDraft((event) => ({ ...event, cocktail: { ...event.cocktail, enabled } }))}
        />
        <MomentRow
          label="Banquete"
          enabled={draft.banquet.enabled}
          caption={`${draft.banquet.start ?? "--"} - ${draft.banquet.end ?? "--"} declarado`}
          onToggle={(enabled) => updateDraft((event) => ({ ...event, banquet: { ...event.banquet, enabled } }))}
        />
        <MomentRow
          label="Fiesta"
          enabled={draft.party.enabled}
          caption={`${draft.party.segments[0]?.start ?? "--"} - ${draft.party.segments[draft.party.segments.length - 1]?.end ?? "--"}`}
          onToggle={(enabled) => updateDraft((event) => ({ ...event, party: { ...event.party, enabled } }))}
        />
        <MomentRow
          label="Resopon"
          enabled={draft.resopon.enabled}
          caption={`Servicio ${draft.resopon.serviceWindow?.[0] ?? "--"}`}
          onToggle={(enabled) => updateDraft((event) => ({ ...event, resopon: { ...event.resopon, enabled } }))}
        />
      </SectionCard>

      <SectionCard title="Puestos" caption="Activa cada puesto y elige donde ocurre.">
        {STAND_OPTIONS.map((option) => (
          <StandConfigRow
            key={option.id}
            label={option.label}
            stand={draft.stands.find((stand) => stand.id === option.id)}
            onToggle={(enabled) => updateStand(option.id, { enabled })}
            onMoment={(moment) => updateStand(option.id, { moment })}
          />
        ))}
      </SectionCard>

      <SectionCard
        title="Banquete"
        caption={`Cada segmento activo dura ${draft.pax > 200 ? 45 : 30} min.`}
      >
        {BANQUET_SEGMENT_OPTIONS.map((option) => (
          <ToggleRow
            key={option.name}
            label={option.label}
            value={draft.banquet.segments.some((segment) => segment.name === option.name)}
            onValueChange={(enabled) => toggleBanquetSegment(option.name, enabled)}
            caption={
              draft.banquet.segments.some((segment) => segment.name === option.name)
                ? `${draft.pax > 200 ? 45 : 30} min`
                : undefined
            }
          />
        ))}
      </SectionCard>

      <SectionCard title="Vista rapida" caption={`Catalogo: ${catalogSource === "supabase" ? "Supabase" : "local"}`}>
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
        caption={enabled ? STAND_MOMENTS.find((item) => item.id === moment)?.label : undefined}
      />
      {enabled ? (
        <View style={styles.segmented}>
          {STAND_MOMENTS.map((item) => {
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

function MomentRow({
  label,
  enabled,
  caption,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  caption: string;
  onToggle: (value: boolean) => void;
}) {
  return (
    <View style={styles.momentRow}>
      <ToggleRow label={label} value={enabled} onValueChange={onToggle} caption={enabled ? caption : undefined} />
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
