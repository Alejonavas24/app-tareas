import { create } from "zustand";
import type { DeviceSession } from "../domain/types";
import { getNativeDeviceId } from "../services/deviceIdentity";
import { validateDeviceSession } from "../services/supabase";

interface SessionState {
  deviceId?: string;
  session?: DeviceSession;
  validating: boolean;
  error?: string;
  bootstrap: () => Promise<void>;
  retry: () => Promise<void>;
  clearError: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  validating: false,

  async bootstrap() {
    if (get().validating) {
      return;
    }
    set({ validating: true, error: undefined });
    try {
      const deviceId = await getNativeDeviceId();
      const session = await validateDeviceSession(deviceId);
      set({ deviceId, session, validating: false });
    } catch (error) {
      set({ error: (error as Error).message, validating: false });
    }
  },

  async retry() {
    set({ session: undefined, error: undefined });
    await get().bootstrap();
  },

  clearError() {
    set({ error: undefined });
  },
}));
