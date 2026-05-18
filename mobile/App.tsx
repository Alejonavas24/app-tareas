import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import type { RootStackParamList } from "./src/navigation/types";
import { AdminPanelScreen } from "./src/screens/AdminPanelScreen";
import { ConfiguratorScreen } from "./src/screens/ConfiguratorScreen";
import { DeviceGateScreen } from "./src/screens/DeviceGateScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { MetrePanelScreen } from "./src/screens/MetrePanelScreen";
import { TimelineScreen } from "./src/screens/TimelineScreen";
import { WorkerTasksScreen } from "./src/screens/WorkerTasksScreen";
import { colors } from "./src/theme/tokens";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.canvas,
    primary: colors.primary,
    card: colors.white,
    text: colors.textStrong,
    border: colors.line,
  },
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
    Inter_600SemiBold: require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"),
    Inter_700Bold: require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer theme={navigationTheme}>
          <StatusBar style="dark" />
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.canvas },
            }}
          >
            <Stack.Screen name="DeviceGate" component={DeviceGateScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="AdminPanel" component={AdminPanelScreen} />
            <Stack.Screen name="MetrePanel" component={MetrePanelScreen} />
            <Stack.Screen name="WorkerTasks" component={WorkerTasksScreen} />
            <Stack.Screen name="Configurator" component={ConfiguratorScreen} />
            <Stack.Screen name="Timeline" component={TimelineScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
});
