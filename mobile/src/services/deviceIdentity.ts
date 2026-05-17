import * as Application from "expo-application";
import { Platform } from "react-native";

export async function getNativeDeviceId(): Promise<string> {
  if (Platform.OS === "ios") {
    const iosId = await Application.getIosIdForVendorAsync();
    return iosId ?? "";
  }

  if (Platform.OS === "android") {
    return Application.getAndroidId() ?? "";
  }

  return Application.applicationId ?? "web-device";
}
