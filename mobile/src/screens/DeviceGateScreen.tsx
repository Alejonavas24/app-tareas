import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import type { RootStackParamList } from "../navigation/types";
import { useSessionStore } from "../store/sessionStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "DeviceGate">;

export function DeviceGateScreen({ navigation }: Props) {
  const { deviceId, session, validating, error, bootstrap, retry } = useSessionStore();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (session) {
      navigation.replace("Home");
    }
  }, [navigation, session]);

  return (
    <Screen title="Validacion de dispositivo" subtitle="Comprobando registro del equipo y empleado.">
      <SectionCard title={validating ? "Validando" : error ? "No autorizado" : "Listo"}>
        {validating ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>Leyendo ID nativo y consultando Supabase.</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.stack}>
            <Text style={styles.error}>{error}</Text>
            {deviceId ? <Text style={styles.deviceId}>ID: {deviceId}</Text> : null}
            <PrimaryButton label="Reintentar" onPress={() => void retry()} />
          </View>
        ) : null}
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    gap: spacing.md,
  },
  stack: {
    gap: spacing.md,
  },
  muted: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 20,
  },
  deviceId: {
    color: colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
});
