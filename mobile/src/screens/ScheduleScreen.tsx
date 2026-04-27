import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Field, ToggleRow } from "../components/Field";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import type { RootStackParamList } from "../navigation/types";
import { useTimelineStore } from "../store/timelineStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Schedule">;

export function ScheduleScreen({ navigation }: Props) {
  const { draft, updateDraft, regenerate } = useTimelineStore();

  if (!draft) {
    return (
      <Screen title="Horarios">
        <Text style={styles.empty}>Selecciona o crea un evento.</Text>
      </Screen>
    );
  }

  return (
    <Screen
      title="Horarios"
      subtitle="Ajusta ventanas por modulo"
      footer={
        <PrimaryButton
          label="Generar timeline"
          onPress={() => {
            regenerate();
            navigation.navigate("Timeline");
          }}
        />
      }
    >
      <SectionCard title="Ceremonia y coctel">
        <TimePair
          startLabel="Ceremonia inicio"
          endLabel="Ceremonia fin"
          start={draft.ceremony.start ?? ""}
          end={draft.ceremony.end ?? ""}
          onStart={(start) => updateDraft((event) => ({ ...event, ceremony: { ...event.ceremony, start } }))}
          onEnd={(end) => updateDraft((event) => ({ ...event, ceremony: { ...event.ceremony, end } }))}
        />
        <TimePair
          startLabel="Coctel inicio"
          endLabel="Coctel fin"
          start={draft.cocktail.start ?? ""}
          end={draft.cocktail.end ?? ""}
          onStart={(start) => updateDraft((event) => ({ ...event, cocktail: { ...event.cocktail, start } }))}
          onEnd={(end) => updateDraft((event) => ({ ...event, cocktail: { ...event.cocktail, end } }))}
        />
        <Field
          label="Desplazamiento post coctel"
          value={String(draft.cocktail.displacementAfterMinutes ?? 0)}
          keyboardType="numeric"
          onChangeText={(value) =>
            updateDraft((event) => ({
              ...event,
              cocktail: { ...event.cocktail, displacementAfterMinutes: Number(value) || 0 },
            }))
          }
        />
      </SectionCard>

      <SectionCard title="Banquete">
        <TimePair
          startLabel="Banquete inicio"
          endLabel="Banquete fin"
          start={draft.banquet.start ?? ""}
          end={draft.banquet.end ?? ""}
          onStart={(start) => updateDraft((event) => ({ ...event, banquet: { ...event.banquet, start } }))}
          onEnd={(end) => updateDraft((event) => ({ ...event, banquet: { ...event.banquet, end } }))}
        />
        <Field
          label="Minutos extra momentos"
          value={String(draft.banquet.momentsExtraMinutes ?? 0)}
          keyboardType="numeric"
          onChangeText={(value) =>
            updateDraft((event) => ({
              ...event,
              banquet: { ...event.banquet, momentsExtraMinutes: Number(value) || 0 },
            }))
          }
        />
        {draft.banquet.segments.map((segment, index) => (
          <Field
            key={`${segment.name}-${index}`}
            label={`Segmento ${segment.name}`}
            value={String(segment.minutes)}
            keyboardType="numeric"
            onChangeText={(value) =>
              updateDraft((event) => ({
                ...event,
                banquet: {
                  ...event.banquet,
                  segments: event.banquet.segments.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, minutes: Number(value) || 0 } : item,
                  ),
                },
              }))
            }
          />
        ))}
      </SectionCard>

      <SectionCard title="Fiesta y resopon">
        {draft.party.segments.map((segment, index) => (
          <View key={`${segment.name}-${index}`} style={styles.segment}>
            <Field
              label="Nombre tramo"
              value={segment.name}
              onChangeText={(name) =>
                updateDraft((event) => ({
                  ...event,
                  party: {
                    ...event.party,
                    segments: event.party.segments.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name } : item,
                    ),
                  },
                }))
              }
            />
            <TimePair
              startLabel="Inicio"
              endLabel="Fin"
              start={segment.start}
              end={segment.end}
              onStart={(start) =>
                updateDraft((event) => ({
                  ...event,
                  party: {
                    ...event.party,
                    segments: event.party.segments.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, start } : item,
                    ),
                  },
                }))
              }
              onEnd={(end) =>
                updateDraft((event) => ({
                  ...event,
                  party: {
                    ...event.party,
                    segments: event.party.segments.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, end } : item,
                    ),
                  },
                }))
              }
            />
          </View>
        ))}
        <Field
          label="Tipo de resopon"
          value={draft.resopon.type ?? "tradicional"}
          onChangeText={(type) =>
            updateDraft((event) => ({
              ...event,
              resopon: { ...event.resopon, type: type as typeof event.resopon.type },
            }))
          }
        />
        <TimePair
          startLabel="Resopon inicio"
          endLabel="Resopon fin"
          start={draft.resopon.serviceWindow?.[0] ?? ""}
          end={draft.resopon.serviceWindow?.[1] ?? ""}
          onStart={(start) =>
            updateDraft((event) => ({
              ...event,
              resopon: { ...event.resopon, serviceWindow: [start, event.resopon.serviceWindow?.[1] ?? start] },
            }))
          }
          onEnd={(end) =>
            updateDraft((event) => ({
              ...event,
              resopon: { ...event.resopon, serviceWindow: [event.resopon.serviceWindow?.[0] ?? end, end] },
            }))
          }
        />
      </SectionCard>

      <SectionCard title="Briefing">
        <ToggleRow
          label="Briefing activo"
          value={Boolean(draft.briefing?.enabled)}
          onValueChange={(enabled) =>
            updateDraft((event) => ({ ...event, briefing: { mode: "simultaneo", ...event.briefing, enabled } }))
          }
        />
        <ToggleRow
          label="Simultaneo"
          caption="Si se apaga, usa la ventana manual."
          value={(draft.briefing?.mode ?? "simultaneo") === "simultaneo"}
          onValueChange={(simultaneo) =>
            updateDraft((event) => ({
              ...event,
              briefing: { enabled: true, ...event.briefing, mode: simultaneo ? "simultaneo" : "secuencial" },
            }))
          }
        />
        {(draft.briefing?.mode ?? "simultaneo") === "secuencial" ? (
          <TimePair
            startLabel="Briefing inicio"
            endLabel="Briefing fin"
            start={draft.briefing?.start ?? ""}
            end={draft.briefing?.end ?? ""}
            onStart={(start) =>
              updateDraft((event) => ({
                ...event,
                briefing: { enabled: true, mode: "secuencial", ...event.briefing, start },
              }))
            }
            onEnd={(end) =>
              updateDraft((event) => ({
                ...event,
                briefing: { enabled: true, mode: "secuencial", ...event.briefing, end },
              }))
            }
          />
        ) : null}
      </SectionCard>
    </Screen>
  );
}

function TimePair({
  startLabel,
  endLabel,
  start,
  end,
  onStart,
  onEnd,
}: {
  startLabel: string;
  endLabel: string;
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowItem}>
        <Field label={startLabel} value={start} onChangeText={onStart} />
      </View>
      <View style={styles.rowItem}>
        <Field label={endLabel} value={end} onChangeText={onEnd} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  rowItem: {
    flex: 1,
  },
  segment: {
    gap: spacing.md,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
  },
});

