import { sortHHMM, toEventMinute } from "./time";
import type {
  EventConfig,
  HHMM,
  StaffingIntervalSummary,
  StaffingMomentSummary,
  StaffingSummary,
  TimelineBlock,
} from "./types";

const MOMENT_LABELS: Record<string, string> = {
  apertura: "Apertura",
  ceremonia: "Ceremonia",
  limonada: "Limonada",
  briefing: "Briefing",
  coctel: "Coctel",
  puesto: "Puestos",
  banquete: "Banquete",
  fiesta: "Fiesta",
  resopon: "Resopon",
  movimiento: "Movimiento",
  cierre: "Cierre",
};

export function banquetBaseStaff(pax: number): number {
  return Math.max(1, Math.ceil(Math.max(1, pax) / 16));
}

function firstExplicitNumber(text: string): number | null {
  const match = text.match(/\b\d+\b/);
  return match ? Number(match[0]) : null;
}

function percentageValue(text: string): number | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
  return match ? Number(match[1].replace(",", ".")) : null;
}

function isAllRule(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return normalized.includes("TODOS") || normalized.includes("TODAS") || normalized.includes("TODOS_CAM") || normalized.includes("100%");
}

function isBanquetService(block: TimelineBlock): boolean {
  return block.module === "banquete" && block.phase === "servicio";
}

export function resolveBlockStaffRequirement(
  event: Pick<EventConfig, "pax">,
  block: TimelineBlock,
): { requiredStaffMin: number; rule: string; warning?: string } {
  const base = banquetBaseStaff(event.pax);
  const ruleText = [block.staffingRule, block.staffText].filter(Boolean).join(" | ").trim();

  if (isBanquetService(block)) {
    return {
      requiredStaffMin: base,
      rule: `Banquete ceil(${event.pax}/16)`,
    };
  }

  if (ruleText && isAllRule(ruleText)) {
    return {
      requiredStaffMin: base,
      rule: `${ruleText} sobre base ${base}`,
    };
  }

  if (ruleText) {
    const pct = percentageValue(ruleText);
    if (pct != null) {
      return {
        requiredStaffMin: Math.ceil((base * pct) / 100),
        rule: `${pct}% sobre base ${base}`,
      };
    }
  }

  if (block.staffMin != null && Number.isFinite(block.staffMin)) {
    return {
      requiredStaffMin: Math.max(0, block.staffMin),
      rule: ruleText || `${block.staffMin} fijo`,
    };
  }

  if (ruleText) {
    const explicit = firstExplicitNumber(ruleText);
    if (explicit != null) {
      return {
        requiredStaffMin: explicit,
        rule: ruleText,
      };
    }
    return {
      requiredStaffMin: 0,
      rule: ruleText,
      warning: `No se pudo interpretar dotacion de ${block.label}: ${ruleText}`,
    };
  }

  return {
    requiredStaffMin: 0,
    rule: "Sin dotacion minima definida",
  };
}

export function annotateBlocksWithStaffing(event: Pick<EventConfig, "pax">, blocks: TimelineBlock[]): TimelineBlock[] {
  return blocks.map((block) => {
    const requirement = resolveBlockStaffRequirement(event, block);
    return {
      ...block,
      requiredStaffMin: requirement.requiredStaffMin,
      requiredStaffRule: requirement.rule,
    };
  });
}

function rangeForBlocks(blocks: TimelineBlock[], anchor: HHMM): { start?: HHMM; end?: HHMM } {
  if (blocks.length === 0) {
    return {};
  }
  const start = blocks.map((block) => block.start).sort((a, b) => sortHHMM(a, b, anchor))[0];
  const end = blocks
    .map((block) => block.end)
    .sort((a, b) => sortHHMM(a, b, anchor))
    .at(-1);
  return { start, end };
}

function buildIntervals(blocks: TimelineBlock[], anchor: HHMM): StaffingIntervalSummary[] {
  const points = Array.from(new Set(blocks.flatMap((block) => [block.start, block.end])))
    .sort((a, b) => sortHHMM(a, b, anchor));

  return points.slice(0, -1).flatMap((start, index) => {
    const end = points[index + 1];
    if (!end || sortHHMM(start, end, anchor) >= 0) {
      return [];
    }

    const activeBlocks = blocks.filter((block) => {
      const blockStart = toEventMinute(block.start, anchor);
      const blockEnd = toEventMinute(block.end, anchor);
      const intervalStart = toEventMinute(start, anchor);
      return blockStart <= intervalStart && intervalStart < blockEnd;
    });
    const requiredStaffMin = activeBlocks.reduce((sum, block) => sum + (block.requiredStaffMin ?? 0), 0);

    return [{
      start,
      end,
      requiredStaffMin,
      blockIds: activeBlocks.map((block) => block.id),
      blockLabels: activeBlocks.map((block) => block.label),
    }];
  });
}

export function computeStaffingSummary(event: Pick<EventConfig, "pax" | "openDoorsTime">, blocks: TimelineBlock[]): StaffingSummary {
  const annotatedBlocks = annotateBlocksWithStaffing(event, blocks);
  const warnings = annotatedBlocks.flatMap((block) => {
    const requirement = resolveBlockStaffRequirement(event, block);
    return requirement.warning ? [requirement.warning] : [];
  });
  const intervals = buildIntervals(annotatedBlocks, event.openDoorsTime);
  const moments: StaffingMomentSummary[] = Object.entries(
    annotatedBlocks.reduce<Record<string, TimelineBlock[]>>((groups, block) => {
      groups[block.module] = [...(groups[block.module] ?? []), block];
      return groups;
    }, {}),
  ).map(([moment, momentBlocks]) => {
    const range = rangeForBlocks(momentBlocks, event.openDoorsTime);
    const momentIntervals = intervals.filter((interval) =>
      momentBlocks.some((block) => interval.blockIds.includes(block.id)),
    );
    return {
      moment,
      label: MOMENT_LABELS[moment] ?? moment,
      start: range.start,
      end: range.end,
      peakStaffMin: momentIntervals.reduce((peak, interval) => Math.max(peak, interval.requiredStaffMin), 0),
      blockCount: momentBlocks.length,
      rules: Array.from(new Set(momentBlocks.map((block) => block.requiredStaffRule).filter(Boolean) as string[])),
      warnings: warnings.filter((warning) => momentBlocks.some((block) => warning.includes(block.label))),
    };
  }).sort((a, b) => {
    if (!a.start || !b.start) {
      return a.label.localeCompare(b.label);
    }
    return sortHHMM(a.start, b.start, event.openDoorsTime);
  });

  return {
    banquetBaseStaff: banquetBaseStaff(event.pax),
    moments,
    intervals,
    peakStaffMin: intervals.reduce((peak, interval) => Math.max(peak, interval.requiredStaffMin), 0),
    warnings,
  };
}
