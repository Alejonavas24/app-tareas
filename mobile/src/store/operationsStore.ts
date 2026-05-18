import { create } from "zustand";
import type {
  AssignableEmployee,
  EventStaffAssignment,
  EventTaskInstance,
  TaskExecutionLog,
  WorkerTask,
} from "../domain/types";
import {
  assignEventBlock,
  assignEventTask,
  autoAssignEventBlocksForEvent,
  autoAssignEventBlocksForStaff,
  completeEventBlock,
  completeWorkerBlock,
  completeTask,
  listTaskExecutionLogs,
  listAssignableWaiters,
  listEventStaff,
  listEventTasks,
  loadWorkerTasks,
  startTask,
  upsertEventStaff,
} from "../services/supabase";

interface OperationsState {
  waiters: AssignableEmployee[];
  staff: EventStaffAssignment[];
  eventTasks: EventTaskInstance[];
  workerTasks: WorkerTask[];
  taskLogs: TaskExecutionLog[];
  loading: boolean;
  saving: boolean;
  error?: string;
  loadWaiters: () => Promise<void>;
  loadStaff: (eventId: string) => Promise<void>;
  loadEventTasks: (eventId: string) => Promise<void>;
  addStaff: (
    eventId: string,
    employee: AssignableEmployee,
    shift: Pick<EventStaffAssignment, "shiftName" | "shiftStart" | "shiftEnd">,
  ) => Promise<EventStaffAssignment | undefined>;
  assignBlock: (eventId: string, blockKey: string, staffId: string) => Promise<void>;
  autoAssignBlocksForStaff: (eventId: string, staffId: string) => Promise<void>;
  autoAssignBlocksForEvent: (eventId: string) => Promise<void>;
  assignTask: (taskInstanceId: string, staffId: string) => Promise<void>;
  completeBlockForWorker: (eventId: string, blockKey: string, employeeId: string, keepCompleted?: boolean) => Promise<void>;
  completeBlockForEvent: (eventId: string, blockKey: string, employeeId?: string, source?: "metre" | "admin") => Promise<void>;
  loadTaskLogs: (eventId: string) => Promise<void>;
  loadTasksForEmployee: (employeeId: string, includeCompleted?: boolean) => Promise<void>;
  startTaskForEmployee: (taskInstanceId: string, employeeId: string) => Promise<void>;
  completeTaskForEmployee: (taskInstanceId: string, employeeId: string, keepCompleted?: boolean) => Promise<void>;
  clearError: () => void;
  clearEventContext: () => void;
}

export const useOperationsStore = create<OperationsState>((set, get) => ({
  waiters: [],
  staff: [],
  eventTasks: [],
  workerTasks: [],
  taskLogs: [],
  loading: false,
  saving: false,

  async loadWaiters() {
    set({ loading: true, error: undefined });
    try {
      set({ waiters: await listAssignableWaiters(), loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  async loadStaff(eventId) {
    set({ loading: true, error: undefined });
    try {
      set({ staff: await listEventStaff(eventId), loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  async loadEventTasks(eventId) {
    set({ loading: true, error: undefined });
    try {
      set({ eventTasks: await listEventTasks(eventId), loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  async addStaff(eventId, employee, shift) {
    set({ saving: true, error: undefined });
    try {
      const saved = await upsertEventStaff(eventId, employee, shift);
      await autoAssignEventBlocksForStaff(eventId, saved.id);
      set({
        staff: [...get().staff.filter((item) => item.employeeId !== saved.employeeId), saved].sort((a, b) =>
          a.fullName.localeCompare(b.fullName),
        ),
        saving: false,
      });
      return saved;
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
      return undefined;
    }
  },

  async assignBlock(eventId, blockKey, staffId) {
    set({ saving: true, error: undefined });
    try {
      await assignEventBlock(eventId, blockKey, staffId);
      set({ saving: false });
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
    }
  },

  async autoAssignBlocksForStaff(eventId, staffId) {
    set({ saving: true, error: undefined });
    try {
      await autoAssignEventBlocksForStaff(eventId, staffId);
      set({ saving: false });
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
    }
  },

  async autoAssignBlocksForEvent(eventId) {
    set({ saving: true, error: undefined });
    try {
      await autoAssignEventBlocksForEvent(eventId);
      set({ saving: false });
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
    }
  },

  async assignTask(taskInstanceId, staffId) {
    set({ saving: true, error: undefined });
    try {
      await assignEventTask(taskInstanceId, staffId);
      set({ saving: false });
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
    }
  },

  async completeBlockForWorker(eventId, blockKey, employeeId, keepCompleted = false) {
    set({ saving: true, error: undefined });
    try {
      await completeWorkerBlock(eventId, blockKey, employeeId);
      set({
        workerTasks: keepCompleted
          ? get().workerTasks.map((task) =>
              task.eventId === eventId && task.blockKey === blockKey
                ? {
                    ...task,
                    status: "completed",
                    completedAt: new Date().toISOString(),
                    completedByEmployeeId: employeeId,
                  }
                : task,
            )
          : get().workerTasks.filter((task) => !(task.eventId === eventId && task.blockKey === blockKey)),
        saving: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
    }
  },

  async completeBlockForEvent(eventId, blockKey, employeeId, source = "metre") {
    set({ saving: true, error: undefined });
    try {
      await completeEventBlock(eventId, blockKey, employeeId, source);
      set({
        eventTasks: get().eventTasks.map((task) =>
          task.eventId === eventId && task.blockKey === blockKey
            ? {
                ...task,
                status: "completed",
                completedAt: new Date().toISOString(),
                completedByEmployeeId: employeeId ?? task.completedByEmployeeId,
              }
            : task,
        ),
        saving: false,
      });
      await get().loadTaskLogs(eventId);
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
    }
  },

  async loadTaskLogs(eventId) {
    set({ loading: true, error: undefined });
    try {
      set({ taskLogs: await listTaskExecutionLogs(eventId), loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  async loadTasksForEmployee(employeeId, includeCompleted = false) {
    set({ loading: true, error: undefined });
    try {
      set({ workerTasks: await loadWorkerTasks(employeeId, { includeCompleted }), loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  async startTaskForEmployee(taskInstanceId, employeeId) {
    set({ saving: true, error: undefined });
    try {
      await startTask(taskInstanceId, employeeId);
      set({
        workerTasks: get().workerTasks.map((task) =>
          task.id === taskInstanceId
            ? { ...task, status: "in_progress", startedAt: new Date().toISOString() }
            : task,
        ),
        saving: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
    }
  },

  async completeTaskForEmployee(taskInstanceId, employeeId, keepCompleted = false) {
    set({ saving: true, error: undefined });
    try {
      await completeTask(taskInstanceId, employeeId);
      set({
        workerTasks: keepCompleted
          ? get().workerTasks.map((task) =>
              task.id === taskInstanceId
                ? {
                    ...task,
                    status: "completed",
                    completedAt: new Date().toISOString(),
                    completedByEmployeeId: employeeId,
                  }
                : task,
            )
          : get().workerTasks.filter((task) => task.id !== taskInstanceId),
        saving: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, saving: false });
    }
  },

  clearError() {
    set({ error: undefined });
  },

  clearEventContext() {
    set({ staff: [], eventTasks: [], taskLogs: [], error: undefined });
  },
}));
