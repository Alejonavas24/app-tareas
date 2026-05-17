import type { EventCatalog, TimelineBlock } from "./types";

export interface MaterializedTaskPreview {
  blockKey: string;
  blockId: string;
  taskCode: string;
  taskSort?: number | null;
  taskName: string;
  details?: string | null;
  startTime: string;
  endTime: string;
  responsable?: string | null;
  dependencyCode?: string | null;
  requiredLevel: number;
}

export function previewMaterializedTasks(blocks: TimelineBlock[], catalog: EventCatalog): MaterializedTaskPreview[] {
  return blocks.flatMap((block) => {
    if (!block.blockId) {
      return mockTasksForBlock(block);
    }
    const catalogTasks = catalog.tasks
      .filter((task) => task.blockId === block.blockId)
      .filter((task) => ["CAMAREROS", "TODOS"].includes((task.responsable ?? "").toUpperCase()))
      .map((task) => ({
        blockKey: block.id,
        blockId: block.blockId as string,
        taskCode: task.taskCode,
        taskSort: task.taskSort ?? null,
        taskName: task.taskName,
        details: task.details ?? null,
        startTime: block.start,
        endTime: block.end,
        responsable: task.responsable ?? null,
        dependencyCode: task.dependencyCode ?? null,
        requiredLevel: task.requiredLevel ?? 0,
      }));

    return catalogTasks.length > 0 ? catalogTasks : mockTasksForBlock(block);
  });
}

function mockTasksForBlock(block: TimelineBlock): MaterializedTaskPreview[] {
  const count = Math.max(1, Math.min(block.taskCount ?? 3, 3));
  const labels = ["Preparar", "Ejecutar", "Cerrar"];

  return Array.from({ length: count }, (_, index) => ({
    blockKey: block.id,
    blockId: block.blockId ?? block.id,
    taskCode: `${block.id}-MOCK-${index + 1}`,
    taskSort: index + 1,
    taskName: `${labels[index] ?? "Completar"}: ${block.label}`,
    details: block.notes ?? "Tarea operativa generada para la reunion hasta validar el catalogo final.",
    startTime: block.start,
    endTime: block.end,
    responsable: "CAMAREROS",
    dependencyCode: index === 0 ? null : `${block.id}-MOCK-${index}`,
    requiredLevel: 0,
  }));
}
