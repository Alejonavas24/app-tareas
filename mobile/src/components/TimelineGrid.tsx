import { ScrollView, StyleSheet, Text, View } from "react-native";
import { diffMinutes, fromMinutes, toEventMinute } from "../domain/time";
import type { HHMM, Phase, TimelineBlock } from "../domain/types";
import { colors, radii, spacing } from "../theme/tokens";

interface TimelineGridProps {
  blocks: TimelineBlock[];
  anchor: HHMM;
}

const LABEL_WIDTH = 328;
const ROW_HEIGHT = 64;
const CELL_WIDTH = 52;
const HEADER_HEIGHT = 38;

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
      return "Transicion";
  }
}

function staffLabel(block: TimelineBlock): string {
  if (block.staffText) {
    return block.staffText;
  }
  if (block.staffMin != null && block.staffMax != null) {
    return block.staffMin === block.staffMax ? `${block.staffMin} pax` : `${block.staffMin}-${block.staffMax} pax`;
  }
  return block.team ?? "Equipo";
}

export function TimelineGrid({ blocks, anchor }: TimelineGridProps) {
  if (blocks.length === 0) {
    return <Text style={styles.empty}>Genera la linea de tiempo para ver la grilla.</Text>;
  }

  const minStart = Math.min(...blocks.map((block) => toEventMinute(block.start, anchor)));
  const maxEnd = Math.max(
    ...blocks.map((block) => toEventMinute(block.start, anchor) + diffMinutes(block.start, block.end)),
  );
  const span = Math.max(maxEnd - minStart, 60);
  const slotCount = Math.ceil(span / 15) + 1;
  const trackWidth = Math.max(slotCount * CELL_WIDTH, 920);
  const ticks = Array.from({ length: slotCount }, (_, index) => minStart + index * 15);

  return (
    <View style={styles.shell}>
      <View style={styles.fixedPane}>
        <View style={styles.fixedHeader}>
          <Text style={styles.headerText}>Bloque</Text>
          <Text style={styles.headerMeta}>Equipo / personas</Text>
        </View>
        {blocks.map((block) => (
          <View key={`label-${block.id}`} style={styles.labelRow}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.blockTitle}>
              {block.label}
            </Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.blockMeta}>
              {block.blockId ?? block.reference ?? "--"} - {staffLabel(block)}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={[styles.trackPane, { width: trackWidth }]}>
          <View style={styles.timeHeader}>
            {ticks.map((minute) => (
              <View key={minute} style={[styles.timeCell, { width: CELL_WIDTH }]}>
                <Text style={styles.tickText}>{fromMinutes(minute)}</Text>
              </View>
            ))}
          </View>

          {blocks.map((block) => {
            const start = toEventMinute(block.start, anchor) - minStart;
            const left = (start / 15) * CELL_WIDTH;
            const width = (block.durationMinutes / 15) * CELL_WIDTH;
            const color =
              colors.modules[(block.colorKey as keyof typeof colors.modules) ?? "taupe"] ?? colors.primary;

            return (
              <View key={`row-${block.id}`} style={styles.trackRow}>
                {ticks.map((minute) => (
                  <View key={`${block.id}-${minute}`} style={[styles.gridCell, { width: CELL_WIDTH }]} />
                ))}
                <View style={[styles.gridBar, { left, width, backgroundColor: color }]}>
                  <Text numberOfLines={1} style={styles.barText}>
                    {block.start}-{block.end}
                  </Text>
                  <Text numberOfLines={1} style={styles.barSubtext}>
                    {phaseLabel(block.phase)} - {block.durationMinutes} min
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    overflow: "hidden",
    backgroundColor: colors.white,
  },
  fixedPane: {
    width: LABEL_WIDTH,
    borderRightColor: colors.line,
    borderRightWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.white,
  },
  fixedHeader: {
    height: HEADER_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    backgroundColor: colors.canvas,
  },
  headerText: {
    color: colors.textStrong,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    textTransform: "uppercase",
  },
  headerMeta: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 1,
  },
  labelRow: {
    height: ROW_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  blockTitle: {
    color: colors.textStrong,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  blockMeta: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 3,
  },
  trackPane: {
    backgroundColor: colors.white,
  },
  timeHeader: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    backgroundColor: colors.canvas,
  },
  timeCell: {
    justifyContent: "center",
    alignItems: "center",
    borderLeftColor: colors.line,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  tickText: {
    color: colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  trackRow: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    position: "relative",
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gridCell: {
    height: ROW_HEIGHT,
    borderLeftColor: colors.line,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  gridBar: {
    position: "absolute",
    top: 12,
    height: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  barText: {
    color: colors.white,
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  barSubtext: {
    color: colors.white,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    marginTop: 1,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
});
