import { ScrollView, StyleSheet, Text, View } from "react-native";
import { diffMinutes, fromMinutes, toEventMinute } from "../domain/time";
import type { HHMM, Phase, TimelineBlock } from "../domain/types";
import { colors, radii, spacing } from "../theme/tokens";

interface TimelineGanttProps {
  blocks: TimelineBlock[];
  anchor: HHMM;
}

const MIN_ROW_WIDTH = 960;
const LABEL_WIDTH = 196;
const ROW_HEIGHT = 76;
const TRACK_HEIGHT = 46;

function staffLabel(block: TimelineBlock): string | undefined {
  if (block.staffText) {
    return block.staffText;
  }
  if (block.staffMin != null && block.staffMax != null) {
    return block.staffMin === block.staffMax ? `${block.staffMin} pax` : `${block.staffMin}-${block.staffMax} pax`;
  }
  return block.team;
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "previa":
      return "Previa";
    case "servicio":
      return "Servicio";
    case "posterior":
      return "Posterior";
    case "briefing":
      return "Briefing";
    case "transicion":
      return "Movimiento";
  }
}

function phaseStyle(phase: Phase) {
  switch (phase) {
    case "previa":
      return {
        opacity: 0.9,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.55)",
      };
    case "posterior":
      return {
        opacity: 0.76,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.45)",
      };
    case "transicion":
      return {
        opacity: 0.95,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.75)",
      };
    default:
      return {
        opacity: 1,
        borderWidth: 0,
        borderColor: "transparent",
      };
  }
}

export function TimelineGantt({ blocks, anchor }: TimelineGanttProps) {
  if (blocks.length === 0) {
    return <Text style={styles.empty}>Genera la linea de tiempo para ver los bloques.</Text>;
  }

  const minStart = Math.min(...blocks.map((block) => toEventMinute(block.start, anchor)));
  const maxEnd = Math.max(
    ...blocks.map((block) => toEventMinute(block.start, anchor) + diffMinutes(block.start, block.end)),
  );
  const span = Math.max(maxEnd - minStart, 60);
  const tickStep = span <= 360 ? 15 : 30;
  const ticks: number[] = [];
  const rowWidth = Math.max(MIN_ROW_WIDTH, LABEL_WIDTH + span * 4);

  for (let minute = minStart; minute <= maxEnd; minute += tickStep) {
    ticks.push(minute);
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={[styles.wrap, { width: rowWidth }]}>
        <View style={styles.headerRow}>
          <View style={styles.labelPane}>
            <Text style={styles.headerLabel}>Momento</Text>
          </View>
          <View style={styles.timelineHeader}>
            {ticks.map((minute) => {
              const leftPct = ((minute - minStart) / span) * 100;
              return (
                <View key={minute} style={[styles.tick, { left: `${leftPct}%` }]}>
                  <Text style={styles.tickText}>{fromMinutes(minute)}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {blocks.map((block) => {
          const start = toEventMinute(block.start, anchor) - minStart;
          const leftPct = (start / span) * 100;
          const widthPct = (block.durationMinutes / span) * 100;
          const color =
            colors.modules[(block.colorKey as keyof typeof colors.modules) ?? "taupe"] ?? colors.primary;
          const phaseVisual = phaseStyle(block.phase);
          const staff = staffLabel(block);

          return (
            <View key={block.id} style={styles.row}>
              <View style={styles.labelPane}>
                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.blockLabel}>
                  {block.label}
                </Text>
                <View style={styles.metaRow}>
                  <View style={[styles.phaseChip, { backgroundColor: colors.phase[block.phase] ?? colors.primary }]}>
                    <Text style={styles.phaseChipText}>{phaseLabel(block.phase)}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.blockMeta}>
                    {block.start} - {block.end}
                  </Text>
                  {staff ? (
                    <Text numberOfLines={1} style={styles.blockMeta}>
                      {staff}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.track}>
                {ticks.map((minute) => {
                  const left = ((minute - minStart) / span) * 100;
                  return <View key={`${block.id}-${minute}`} style={[styles.gridLine, { left: `${left}%` }]} />;
                })}

                <View
                  style={[
                    styles.bar,
                    phaseVisual,
                    {
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: color,
                      height: block.phase === "transicion" ? 22 : 34,
                    },
                  ]}
                >
                  <Text numberOfLines={1} style={styles.barText}>
                    {phaseLabel(block.phase)} - {block.durationMinutes} min{staff ? ` - ${staff}` : ""}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  headerRow: {
    height: 42,
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerLabel: {
    color: colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
  },
  timelineHeader: {
    flex: 1,
    position: "relative",
    justifyContent: "flex-end",
    paddingBottom: spacing.sm,
  },
  tick: {
    position: "absolute",
    top: 0,
    marginLeft: -18,
  },
  tickText: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  labelPane: {
    width: LABEL_WIDTH,
    height: ROW_HEIGHT,
    justifyContent: "center",
  },
  blockLabel: {
    color: colors.textStrong,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 4,
  },
  phaseChip: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  phaseChipText: {
    color: colors.white,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    textTransform: "uppercase",
  },
  blockMeta: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    flexShrink: 1,
  },
  track: {
    flex: 1,
    height: TRACK_HEIGHT,
    justifyContent: "center",
    borderRadius: radii.sm,
    backgroundColor: colors.canvas,
    overflow: "hidden",
    position: "relative",
  },
  gridLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.line,
  },
  bar: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    overflow: "hidden",
  },
  barText: {
    color: colors.white,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
});
