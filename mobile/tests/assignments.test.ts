import { describe, expect, it } from "vitest";
import { fallbackEventCatalog } from "../src/data/catalog";
import { createEmptyEvent } from "../src/domain/defaults";
import {
  canCompleteTask,
  isAssignableWaiter,
  parseRoles,
  proposeShift,
  rangesOverlap,
} from "../src/domain/assignments";
import { previewMaterializedTasks } from "../src/domain/taskMaterialization";
import type { TimelineBlock } from "../src/domain/types";

describe("assignment helpers", () => {
  it("parses comma-separated employee roles", () => {
    expect(parseRoles("camarero, barra")).toEqual(["camarero", "barra"]);
    expect(isAssignableWaiter({ roles: parseRoles("Barra, CAMARERO") })).toBe(true);
    expect(isAssignableWaiter({ roles: parseRoles("cocina") })).toBe(false);
  });

  it("checks task difficulty against employee skill level", () => {
    expect(canCompleteTask({ skillLevel: 0 }, { requiredLevel: 0 })).toBe(true);
    expect(canCompleteTask({ skillLevel: 2 }, { requiredLevel: 1 })).toBe(true);
    expect(canCompleteTask({ skillLevel: 1 }, { requiredLevel: 2 })).toBe(false);
  });

  it("generates automatic eight-hour T1 and T2 shifts", () => {
    const event = createEmptyEvent();
    const blocks: TimelineBlock[] = [
      {
        id: "party-previa",
        label: "Fiesta - previa",
        module: "fiesta",
        phase: "previa",
        start: "17:00",
        end: "18:00",
        durationMinutes: 60,
      },
    ];

    expect(proposeShift(event, blocks, "T1")).toMatchObject({
      shiftName: "T1",
      shiftStart: event.openDoorsTime,
      shiftEnd: "20:15",
    });
    expect(proposeShift(event, blocks, "T2")).toMatchObject({
      shiftName: "T2",
      shiftStart: "17:00",
      shiftEnd: "01:00",
    });
  });

  it("detects task and shift overlap across midnight", () => {
    expect(rangesOverlap("23:30", "00:30", "22:00", "06:00", "17:00")).toBe(true);
    expect(rangesOverlap("12:00", "13:00", "18:00", "02:00", "10:00")).toBe(false);
  });
});

describe("task materialization preview", () => {
  it("expands timeline blocks into waiter catalog tasks", () => {
    const block: TimelineBlock = {
      id: "limonada-previa",
      blockId: "B03a",
      label: "Puesto limonada - previa",
      module: "limonada",
      phase: "previa",
      start: "11:37",
      end: "12:15",
      durationMinutes: 38,
    };
    const tasks = previewMaterializedTasks([block], fallbackEventCatalog);

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => task.blockKey === "limonada-previa")).toBe(true);
    expect(tasks.every((task) => task.requiredLevel === 0)).toBe(true);
  });

  it("creates mock tasks when a block has no catalog task match", () => {
    const block: TimelineBlock = {
      id: "custom-demo-block",
      label: "Bloque demo",
      module: "coctel",
      phase: "servicio",
      start: "12:00",
      end: "13:00",
      durationMinutes: 60,
      taskCount: 5,
    };
    const tasks = previewMaterializedTasks([block], fallbackEventCatalog);

    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({
      blockKey: "custom-demo-block",
      taskCode: "custom-demo-block-MOCK-1",
      responsable: "CAMAREROS",
      requiredLevel: 0,
    });
  });
});
