import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ClipboardList, Settings2 } from "lucide-react-native";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { SectionCard } from "../components/SectionCard";
import type { RootStackParamList } from "../navigation/types";
import { useSessionStore } from "../store/sessionStore";
import { colors, spacing } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { session, deviceId } = useSessionStore();

  return (
    <Screen title="Operativa" subtitle={session ? `Hola, ${session.fullName}` : "Dispositivo validado"}>
      <SectionCard title="Accesos">
        <View style={styles.actions}>
          <PrimaryButton
            label="Mis tareas"
            icon={ClipboardList}
            onPress={() => navigation.navigate("WorkerTasks")}
          />
          <PrimaryButton
            label="Panel admin"
            variant="secondary"
            icon={Settings2}
            onPress={() => navigation.navigate("AdminPanel")}
          />
        </View>
      </SectionCard>

      <SectionCard title="Sesion">
        <Text style={styles.line}>Empleado: {session?.fullName ?? "--"}</Text>
        <Text style={styles.line}>Roles: {session?.roles.join(", ") || "--"}</Text>
        <Text style={styles.deviceId}>Dispositivo: {deviceId ?? session?.deviceId ?? "--"}</Text>
      </SectionCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.md,
  },
  line: {
    color: colors.textStrong,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  deviceId: {
    color: colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
});
