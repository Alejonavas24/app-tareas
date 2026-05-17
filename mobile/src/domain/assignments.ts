import { addMinutes, sortHHMM, toEventMinute } from "./time";
import type {
  AssignableEmployee,
  EventConfig,
  EventStaffAssignment,
  HHMM,
  TimelineBlock,
  WorkerTask,
} from "./types";

export function parseRoles(rolesText?: string | null): string[] {
  return (rolesText ?? "")
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
}

export function hasRole(roles: string[], role: string): boolean {
  const expected = role.trim().toLowerCase();
  return roles.map((item) => item.trim().toLowerCase()).includes(expected);
}

export function isAdmin(roles: string[]): boolean {
  return hasRole(roles, "admin") || hasRole(roles, "administrador");
}

export function isMetre(roles: string[]): boolean {
  return hasRole(roles, "metre");
}

export function isAssignableWaiter(employee: Pick<AssignableEmployee, "roles">): boolean {
  return hasRole(employee.roles, "camarero");
}

export function canCompleteTask(
  employee: Pick<AssignableEmployee | EventStaffAssignment, "skillLevel">,
  task: Pick<WorkerTask, "requiredLevel">,
): boolean {
  return employee.skillLevel >= task.requiredLevel;
}

export function rangesOverlap(
  startA: HHMM,
  endA: HHMM,
  startB: HHMM,
  endB: HHMM,
  anchor: HHMM,
): boolean {
  return toEventMinute(startA, anchor) < toEventMinute(endB, anchor) &&
    toEventMinute(startB, anchor) < toEventMinute(endA, anchor);
}

function firstTurnTwoBlock(blocks: TimelineBlock[], anchor: HHMM): TimelineBlock | undefined {
  return blocks
    .filter((block) => {
      const marker = `${block.team ?? ""} ${block.notes ?? ""}`.toLowerCase();
      return marker.includes("t2") || marker.includes("turno 2") || block.module === "fiesta";
    })
    .sort((a, b) => sortHHMM(a.start, b.start, anchor))[0];
}

export function proposeShift(
  event: EventConfig,
  blocks: TimelineBlock[],
  shiftName: "T1" | "T2",
): Pick<EventStaffAssignment, "shiftName" | "shiftStart" | "shiftEnd"> {
  if (shiftName === "T1") {
    return {
      shiftName,
      shiftStart: event.openDoorsTime,
      shiftEnd: addMinutes(event.openDoorsTime, 8 * 60),
    };
  }

  const t2Start = firstTurnTwoBlock(blocks, event.openDoorsTime)?.start ??
    (event.endTime ? addMinutes(event.endTime, -8 * 60) : event.openDoorsTime);

  return {
    shiftName,
    shiftStart: t2Start,
    shiftEnd: addMinutes(t2Start, 8 * 60),
  };
}
