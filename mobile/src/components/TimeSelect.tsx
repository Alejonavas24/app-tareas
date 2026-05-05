import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, Clock } from "lucide-react-native";
import { fromMinutes } from "../domain/time";
import type { HHMM } from "../domain/types";
import { colors, radii, spacing } from "../theme/tokens";

interface TimeSelectProps {
  label: string;
  value: HHMM;
  onValueChange: (value: HHMM) => void;
}

export function TimeSelect({ label, value, onValueChange }: TimeSelectProps) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => Array.from({ length: 96 }, (_, index) => fromMinutes(index * 15)), []);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.control}>
        <View style={styles.valueRow}>
          <Clock color={colors.primary} size={18} strokeWidth={2} />
          <Text style={styles.value}>{value}</Text>
        </View>
      </Pressable>

      <Modal animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {options.map((option) => {
                const selected = option === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={option}
                    onPress={() => {
                      onValueChange(option);
                      setOpen(false);
                    }}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}</Text>
                    {selected ? <Check color={colors.primary} size={18} strokeWidth={2.5} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textMedium,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  control: {
    minHeight: 44,
    justifyContent: "center",
    borderColor: colors.primary,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
  },
  valueRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  value: {
    color: colors.textStrong,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    width: "100%",
    maxHeight: "78%",
    borderRadius: radii.md,
    backgroundColor: colors.white,
    padding: spacing.lg,
  },
  sheetTitle: {
    color: colors.textStrong,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    marginBottom: spacing.md,
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    gap: spacing.xs,
  },
  option: {
    minHeight: 42,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
  },
  optionSelected: {
    backgroundColor: colors.primarySoft,
  },
  optionText: {
    color: colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  optionTextSelected: {
    color: colors.textStrong,
  },
});
