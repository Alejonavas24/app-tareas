import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { RootStackParamList } from "./src/navigation/types";
import { ConfiguratorScreen } from "./src/screens/ConfiguratorScreen";
import { AssumptionsScreen } from "./src/screens/AssumptionsScreen";
import { BaseEventScreen } from "./src/screens/BaseEventScreen";
import { BlocksScreen } from "./src/screens/BlocksScreen";
import { EventListScreen } from "./src/screens/EventListScreen";
import { ModulesScreen } from "./src/screens/ModulesScreen";
import { ScheduleScreen } from "./src/screens/ScheduleScreen";
import { TimelineScreen } from "./src/screens/TimelineScreen";
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
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme}>
        <StatusBar style="dark" />
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.canvas },
          }}
        >
          <Stack.Screen name="Configurator" component={ConfiguratorScreen} />
          <Stack.Screen name="Events" component={EventListScreen} />
          <Stack.Screen name="BaseEvent" component={BaseEventScreen} />
          <Stack.Screen name="Modules" component={ModulesScreen} />
          <Stack.Screen name="Schedule" component={ScheduleScreen} />
          <Stack.Screen name="Timeline" component={TimelineScreen} />
          <Stack.Screen name="Blocks" component={BlocksScreen} />
          <Stack.Screen name="Assumptions" component={AssumptionsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
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
