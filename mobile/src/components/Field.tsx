import { useEffect, useRef, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { colors, radii, spacing } from "../theme/tokens";

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
  multiline?: boolean;
  required?: boolean;
  errorMessage?: string;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline,
  required = true,
  errorMessage = "Este campo es obligatorio.",
}: FieldProps) {
  const [localValue, setLocalValue] = useState(value);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [preserveEmpty, setPreserveEmpty] = useState(false);
  const previousValueRef = useRef(value);
  const isEmpty = required && localValue.trim().length === 0;
  const showError = isEmpty && touched;

  useEffect(() => {
    const propChanged = previousValueRef.current !== value;
    previousValueRef.current = value;

    if (propChanged) {
      setPreserveEmpty(false);
      setLocalValue(value);
      return;
    }

    if (!focused && !preserveEmpty) {
      setLocalValue(value);
    }
  }, [focused, preserveEmpty, value]);

  function handleChangeText(nextValue: string) {
    setLocalValue(nextValue);
    setTouched(true);

    if (required && nextValue.trim().length === 0) {
      setPreserveEmpty(true);
      return;
    }

    setPreserveEmpty(false);
    onChangeText(nextValue);
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline, showError && styles.inputError]}
        value={localValue}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setTouched(true);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
      />
      {showError ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </View>
  );
}

interface ToggleRowProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  caption?: string;
}

export function ToggleRow({ label, value, onValueChange, caption }: ToggleRowProps) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.line, true: colors.primarySoft }}
        thumbColor={value ? colors.primary : colors.white}
      />
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
  input: {
    minHeight: 44,
    borderColor: colors.primary,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.textStrong,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    color: colors.danger,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  toggleRow: {
    minHeight: 48,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleLabel: {
    color: colors.textStrong,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  caption: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
});
