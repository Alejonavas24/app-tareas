import catalog200Json from "../data/examples/catalog200pax.json";
import catalogBaseJson from "../data/examples/catalogBase.json";
import { normalizeEventConfig } from "./defaults";
import {
  addMinutes,
  diffMinutes,
  fromMinutes,
  isBefore,
  isHHMM,
  rangeOverlaps,
  sortHHMM,
  toEventMinute,
} from "./time";
import type {
  CatalogBlock,
  EventConfig,
  HHMM,
  Phase,
  TimelineAssumption,
  TimelineBlock,
  TimelineResult,
} from "./types";

const catalogBase = catalogBaseJson as unknown as CatalogBlock[];
const catalog200 = catalog200Json as unknown as CatalogBlock[];

const STAND_REFS: Record<string, { ref: string; label: string }> = {
  jamon_1x50: { ref: "P_JA", label: "Puesto jamon" },
  quesos_clasico: { ref: "P_QU_C", label: "Puesto quesos clasico" },
  croquetas: { ref: "P_CR", label: "Puesto croquetas" },
  cerveza: { ref: "P_CE", label: "Puesto cerveza" },
};

const RESOPON_REFS: Record<string, string> = {
  tradicional: "RES_TRA",
  americano: "RES_AME",
  barra: "RES_BAR",
  italiano: "RES_ITA",
  mc: "RES_MC",
};

const MODULE_COLORS: Record<string, string> = {
  apertura: "taupe",
  ceremonia: "rose",
  limonada: "sage",
  briefing: "stone",
  coctel: "gold",
  puesto: "clay",
  banquete: "ink",
  fiesta: "plum",
  resopon: "mint",
  movimiento: "slate",
  cierre: "slate",
};

function referencesInclude(entry: CatalogBlock, ref: string): boolean {
  return (entry.referencias ?? "")
    .split(",")
    .map((part) => part.trim())
    .includes(ref);
}

function findCatalog(ref: string, phase?: Phase, prefer200 = false): CatalogBlock | undefined {
  const phaseText = phase && phase !== "transicion" && phase !== "briefing" ? phase : undefined;
  const source = prefer200 ? catalog200 : catalogBase;
  return source.find((entry) => {
    const phaseMatches = !phaseText || entry.momentos === phaseText;
    return phaseMatches && referencesInclude(entry, ref);
  });
}

function assumption(
  id: string,
  label: string,
  detail: string,
  source?: string,
): TimelineAssumption {
  return { id, label, detail, source, reviewed: false };
}

function catalogNote(entry?: CatalogBlock, prefer200 = false): string | undefined {
  if (!entry) {
    return undefined;
  }
  if (prefer200 && entry.ajuste200pax && entry.ajuste200pax !== "Sin cambio estructural") {
    return `${entry.notasOperativas ?? ""} ${entry.notas200pax ?? ""}`.trim();
  }
  return entry.notasOperativas;
}

function buildBlock(input: {
  id: string;
  label: string;
  module: string;
  phase: Phase;
  start: HHMM;
  end: HHMM;
  reference?: string;
  parentBlockId?: string;
  team?: string;
  notes?: string;
  assumptions?: string[];
}): TimelineBlock {
  return {
    ...input,
    durationMinutes: diffMinutes(input.start, input.end),
    colorKey: MODULE_COLORS[input.module] ?? "taupe",
    assumptions: input.assumptions ?? [],
    overlapsWith: [],
  };
}

function addIfValid(
  blocks: TimelineBlock[],
  warnings: string[],
  block: TimelineBlock,
  anchor: HHMM,
) {
  if (!isHHMM(block.start) || !isHHMM(block.end)) {
    warnings.push(`Bloque ignorado por horario invalido: ${block.label}`);
    return;
  }
  if (block.durationMinutes <= 0) {
    warnings.push(`Bloque con duracion cero o negativa: ${block.label}`);
    return;
  }
  if (toEventMinute(block.end, anchor) < toEventMinute(block.start, anchor)) {
    warnings.push(`Bloque fuera de orden operativo: ${block.label}`);
  }
  blocks.push(block);
}

function maybeAddTransition(
  event: EventConfig,
  blocks: TimelineBlock[],
  warnings: string[],
  input: {
    id: string;
    label: string;
    start?: HHMM;
    end?: HHMM;
    notes?: string;
  },
) {
  if (!input.start || !input.end) {
    return;
  }
  if (diffMinutes(input.start, input.end) <= 0) {
    return;
  }
  addIfValid(
    blocks,
    warnings,
    buildBlock({
      id: input.id,
      label: input.label,
      module: "movimiento",
      phase: "transicion",
      start: input.start,
      end: input.end,
      reference: "MOVE",
      team: "Invitados",
      notes: input.notes ?? "Intervalo de movimiento entre momentos del evento.",
    }),
    event.openDoorsTime,
  );
}

function firstServiceStart(event: EventConfig): HHMM {
  const candidates = [
    event.ceremony.enabled ? event.ceremony.start : undefined,
    event.cocktail.enabled ? event.cocktail.start : undefined,
    event.banquet.enabled ? event.banquet.start : undefined,
    event.party.enabled ? event.party.segments[0]?.start : undefined,
  ].filter(isHHMM);

  return candidates.sort((a, b) => sortHHMM(a, b, event.openDoorsTime))[0] ?? event.openDoorsTime;
}

function addOpening(event: EventConfig, blocks: TimelineBlock[], warnings: string[]) {
  const firstStart = firstServiceStart(event);
  if (isBefore(event.openDoorsTime, firstStart, event.openDoorsTime)) {
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        id: "opening",
        label: "Apertura de puertas / recepcion invitados",
        module: "apertura",
        phase: "transicion",
        start: event.openDoorsTime,
        end: firstStart,
        reference: "EVEN",
        team: "Sala",
        notes: "Inicio operativo visible del evento.",
      }),
      event.openDoorsTime,
    );
  }
}

function addCeremony(event: EventConfig, blocks: TimelineBlock[], warnings: string[]) {
  const { ceremony } = event;
  if (!ceremony.enabled || !ceremony.start || !ceremony.end) {
    return;
  }

  if (ceremony.civil) {
    const previousEntry = findCatalog("C_CI", "previa", event.pax > 200);
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        id: "ceremony-previa",
        label: "Ceremonia civil - previa",
        module: "ceremonia",
        phase: "previa",
        start: event.openDoorsTime,
        end: ceremony.start,
        reference: "C_CI",
        parentBlockId: "ceremony",
        team: "T1",
        notes: catalogNote(previousEntry, event.pax > 200),
      }),
      event.openDoorsTime,
    );

    const serviceEntry = findCatalog("C_CI", "servicio", event.pax > 200);
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        id: "ceremony-service",
        label: "Ceremonia civil - servicio",
        module: "ceremonia",
        phase: "servicio",
        start: ceremony.start,
        end: ceremony.end,
        reference: "C_CI",
        parentBlockId: "ceremony",
        team: "2 pax",
        notes: catalogNote(serviceEntry, event.pax > 200),
      }),
      event.openDoorsTime,
    );
  }

  if (ceremony.limonada) {
    const previousEntry = findCatalog("P_LIM", "previa", event.pax > 200);
    const serviceEntry = findCatalog("P_LIM", "servicio", event.pax > 200);
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        id: "limonada-previa",
        label: "Puesto limonada - previa",
        module: "limonada",
        phase: "previa",
        start: event.openDoorsTime,
        end: ceremony.start,
        reference: "P_LIM",
        parentBlockId: "limonada",
        team: "T1",
        notes: catalogNote(previousEntry, event.pax > 200),
      }),
      event.openDoorsTime,
    );
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        id: "limonada-service",
        label: "Puesto limonada - servicio",
        module: "limonada",
        phase: "servicio",
        start: ceremony.start,
        end: ceremony.end,
        reference: "P_LIM",
        parentBlockId: "limonada",
        team: "2 pax",
        notes: catalogNote(serviceEntry, event.pax > 200),
      }),
      event.openDoorsTime,
    );
  }

  if (event.briefing?.enabled) {
    const start = event.briefing.mode === "secuencial" && event.briefing.start ? event.briefing.start : ceremony.start;
    const end = event.briefing.mode === "secuencial" && event.briefing.end ? event.briefing.end : ceremony.end;
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        id: "briefing",
        label: "Briefing + descanso",
        module: "briefing",
        phase: "briefing",
        start,
        end,
        reference: "ACTA",
        team: "Resto equipo",
        notes:
          event.briefing.mode === "simultaneo"
            ? "Simultaneo a ceremonia/limonada para el equipo que no queda en servicio."
            : "Briefing configurado como bloque secuencial.",
      }),
      event.openDoorsTime,
    );
  }
}

function addCocktail(event: EventConfig, blocks: TimelineBlock[], warnings: string[]) {
  const { cocktail, ceremony } = event;
  if (!cocktail.enabled || !cocktail.start || !cocktail.end) {
    return;
  }

  const cocktailStart = cocktail.start;
  const cocktailEnd = cocktail.end;
  const previousStart = ceremony.enabled && ceremony.start ? ceremony.start : event.openDoorsTime;
  if (ceremony.enabled && ceremony.end && cocktailStart !== ceremony.end) {
    maybeAddTransition(event, blocks, warnings, {
      id: "transition-ceremony-cocktail",
      label: "Movimiento ceremonia -> coctel",
      start: ceremony.end,
      end: cocktailStart,
      notes: "Desplazamiento y acomodo de invitados entre ceremonia y coctel.",
    });
  }
  const previousEntry = findCatalog("COC_L", "previa", event.pax > 200);
  addIfValid(
    blocks,
    warnings,
    buildBlock({
      id: "cocktail-previa",
      label: "Coctel base - previa",
      module: "coctel",
      phase: "previa",
      start: previousStart,
      end: cocktailStart,
      reference: "COC_L",
      parentBlockId: "cocktail",
      team: "T1",
      notes: catalogNote(previousEntry, event.pax > 200),
    }),
    event.openDoorsTime,
  );

  ["comida", "bebida", "barra"].forEach((part, index) => {
    const entry = findCatalog("COC_L", "servicio", event.pax > 200);
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        id: `cocktail-service-${part}`,
        label: `Coctel base - ${part}`,
        module: "coctel",
        phase: "servicio",
        start: cocktailStart,
        end: cocktailEnd,
        reference: "COC_L",
        parentBlockId: "cocktail",
        team: index === 2 ? "Barra" : "Sala",
        notes: catalogNote(entry, event.pax > 200),
      }),
      event.openDoorsTime,
    );
  });

  const standIds = new Set(cocktail.stands ?? []);
  if (ceremony.beerStand) {
    standIds.add("cerveza");
  }

  standIds.forEach((standId) => {
    const stand = STAND_REFS[standId];
    if (!stand) {
      warnings.push(`Puesto sin referencia de catalogo: ${standId}`);
      return;
    }
    const entry = findCatalog(stand.ref, undefined, event.pax > 200);
    const duplicate = event.pax > 200 && (entry?.ajuste200pax ?? "").includes("duplica");
    const copies = duplicate ? ["1", "2"] : ["1"];
    copies.forEach((copy) => {
      const suffix = duplicate ? ` ${copy}` : "";
      addIfValid(
        blocks,
        warnings,
        buildBlock({
          id: `stand-${stand.ref}-${copy}`,
          label: `${stand.label}${suffix}`,
          module: "puesto",
          phase: entry?.momentos === "servicio" ? "servicio" : "previa",
          start: previousStart,
          end: cocktailEnd,
          reference: stand.ref,
          parentBlockId: `stand-${stand.ref}`,
          team: "Puesto",
          notes: catalogNote(entry, event.pax > 200),
          assumptions: duplicate ? ["Se duplica una vez por regla >200 pax."] : [],
        }),
        event.openDoorsTime,
      );
    });
  });
}

function addBanquet(
  event: EventConfig,
  blocks: TimelineBlock[],
  warnings: string[],
  assumptions: TimelineAssumption[],
) {
  const { banquet, cocktail } = event;
  if (!banquet.enabled || !banquet.start || !banquet.end) {
    return;
  }

  const previousStart = cocktail.enabled && cocktail.start ? cocktail.start : addMinutes(banquet.start, -60);
  if (cocktail.enabled && cocktail.end && banquet.start !== cocktail.end) {
    maybeAddTransition(event, blocks, warnings, {
      id: "transition-cocktail-banquet",
      label: "Movimiento coctel -> banquete",
      start: cocktail.end,
      end: banquet.start,
      notes: "Paso de invitados desde coctel hacia el espacio de banquete.",
    });
  }
  const previaEntry = findCatalog("BAN", "previa", event.pax > 200);
  addIfValid(
    blocks,
    warnings,
    buildBlock({
      id: "banquet-previa",
      label: "Banquete - previa de rangos y apoyos",
      module: "banquete",
      phase: "previa",
      start: previousStart,
      end: banquet.start,
      reference: "BAN",
      parentBlockId: "banquet",
      team: "Sala",
      notes: catalogNote(previaEntry, event.pax > 200),
    }),
    event.openDoorsTime,
  );

  let segmentStart = banquet.start;
  banquet.segments.forEach((segment, index) => {
    const segmentEnd = addMinutes(segmentStart, segment.minutes);
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        id: `banquet-service-${segment.name}-${index}`,
        label: `Banquete - ${segment.name}`,
        module: "banquete",
        phase: "servicio",
        start: segmentStart,
        end: segmentEnd,
        reference: segment.name.toUpperCase(),
        parentBlockId: "banquet",
        team: "Rangos",
        notes: "Servicio visible del banquete segun segmentos configurados.",
      }),
      event.openDoorsTime,
    );
    segmentStart = segmentEnd;
  });

  const configuredDuration = diffMinutes(banquet.start, banquet.end);
  const segmentDuration = banquet.segments.reduce((sum, segment) => sum + segment.minutes, 0);
  const extra = banquet.momentsExtraMinutes ?? 0;
  if (Math.abs(segmentDuration + extra - configuredDuration) > 5) {
    assumptions.push(
      assumption(
        "banquet-duration-gap",
        "Banquete ajustado por duracion",
        `Los segmentos suman ${segmentDuration + extra} min y la ventana declarada dura ${configuredDuration} min.`,
        "banquet",
      ),
    );
  }

  const closeEntry = findCatalog("BAN", "posterior", event.pax > 200);
  addIfValid(
    blocks,
    warnings,
    buildBlock({
      id: "banquet-close",
      label: "Banquete - cierre de salon",
      module: "banquete",
      phase: "posterior",
      start: banquet.end,
      end: addMinutes(banquet.end, 120),
      reference: "BAN",
      parentBlockId: "banquet",
      team: "T1",
      notes: catalogNote(closeEntry, event.pax > 200) ?? "Cierre operativo modelado con referencia de 2 horas.",
      assumptions: ["Recogida de banquete modelada con referencia operativa cercana a 2 horas."],
    }),
    event.openDoorsTime,
  );
}

function addParty(event: EventConfig, blocks: TimelineBlock[], warnings: string[]) {
  const { party, banquet } = event;
  if (!party.enabled || party.segments.length === 0) {
    return;
  }

  const firstPartyStart = party.segments[0].start;
  const lastPartyEnd = party.segments[party.segments.length - 1].end;
  const previaStart = banquet.enabled && banquet.end ? addMinutes(banquet.end, -45) : addMinutes(firstPartyStart, -45);
  if (banquet.enabled && banquet.end && firstPartyStart !== banquet.end) {
    maybeAddTransition(event, blocks, warnings, {
      id: "transition-banquet-party",
      label: "Movimiento banquete -> fiesta",
      start: banquet.end,
      end: firstPartyStart,
      notes: "Cambio de momento desde el cierre de banquete hacia el arranque visible de fiesta.",
    });
  }

  const previaEntry = findCatalog("FIE-7", "previa", event.pax > 200);
  addIfValid(
    blocks,
    warnings,
    buildBlock({
      id: "party-previa",
      label: "Barra libre - previa + entrada T2",
      module: "fiesta",
      phase: "previa",
      start: previaStart,
      end: firstPartyStart,
      reference: "FIE-7",
      parentBlockId: "party",
      team: "T2",
      notes: catalogNote(previaEntry, event.pax > 200) ?? "T2 entra aproximadamente 45 min antes del fin del banquete.",
    }),
    event.openDoorsTime,
  );

  party.segments.forEach((segment, index) => {
    const serviceEntry = findCatalog("FIE-7", "servicio", event.pax > 200);
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        id: `party-service-${index}`,
        label: `Fiesta - ${segment.name}`,
        module: "fiesta",
        phase: "servicio",
        start: segment.start,
        end: segment.end,
        reference: "FIE-7",
        parentBlockId: "party",
        team: "Barra",
        notes: catalogNote(serviceEntry, event.pax > 200),
      }),
      event.openDoorsTime,
    );
  });

  const closeEntry = findCatalog("FIE-7", "posterior", event.pax > 200);
  addIfValid(
    blocks,
    warnings,
    buildBlock({
      id: "party-close",
      label: "Barra libre - cierre",
      module: "fiesta",
      phase: "posterior",
      start: lastPartyEnd,
      end: addMinutes(lastPartyEnd, 45),
      reference: "FIE-7",
      parentBlockId: "party",
      team: "Barra",
      notes: catalogNote(closeEntry, event.pax > 200),
    }),
    event.openDoorsTime,
  );
}

function addResopon(event: EventConfig, blocks: TimelineBlock[], warnings: string[]) {
  const { resopon } = event;
  if (!resopon.enabled || !resopon.type || !resopon.serviceWindow) {
    return;
  }

  const ref = RESOPON_REFS[resopon.type] ?? "RES_TRA";
  const serviceStart = resopon.serviceWindow[0];
  const configuredEnd = resopon.serviceWindow[1];
  const serviceEnd = serviceStart === configuredEnd ? addMinutes(serviceStart, 30) : configuredEnd;
  const previousStart = addMinutes(serviceStart, -60);
  const previousEntry = findCatalog(ref, "previa", event.pax > 200);
  const serviceEntry = findCatalog(ref, "servicio", event.pax > 200);

  addIfValid(
    blocks,
    warnings,
    buildBlock({
      id: "resopon-previa",
      label: `Resopon ${resopon.type} - previa`,
      module: "resopon",
      phase: "previa",
      start: previousStart,
      end: serviceStart,
      reference: ref,
      parentBlockId: "resopon",
      team: "T2",
      notes: catalogNote(previousEntry, event.pax > 200) ?? "La previa del resopon corre dentro de fiesta.",
    }),
    event.openDoorsTime,
  );

  addIfValid(
    blocks,
    warnings,
    buildBlock({
      id: "resopon-service",
      label: `Resopon ${resopon.type} - servicio`,
      module: "resopon",
      phase: "servicio",
      start: serviceStart,
      end: serviceEnd,
      reference: ref,
      parentBlockId: "resopon",
      team: "T2",
      notes: catalogNote(serviceEntry, event.pax > 200),
      assumptions: serviceStart === configuredEnd ? ["Ventana puntual convertida en servicio de 30 minutos."] : [],
    }),
    event.openDoorsTime,
  );
}

function computeOverlaps(blocks: TimelineBlock[], anchor: HHMM): TimelineBlock[] {
  return blocks.map((block) => {
    const overlapsWith = blocks
      .filter((candidate) => {
        if (candidate.id === block.id) {
          return false;
        }
        if (candidate.parentBlockId && candidate.parentBlockId === block.parentBlockId) {
          return false;
        }
        return rangeOverlaps(block.start, block.end, candidate.start, candidate.end, anchor);
      })
      .map((candidate) => candidate.id);
    return { ...block, overlapsWith };
  });
}

function normalizeMomentLabel(block: TimelineBlock): string {
  if (block.module === "ceremonia") {
    return "Ceremonia";
  }
  if (block.module === "limonada") {
    return "Limonada";
  }
  if (block.module === "coctel" || block.module === "puesto") {
    return "Coctel";
  }
  if (block.module === "banquete") {
    return "Banquete";
  }
  if (block.module === "fiesta" || block.module === "resopon") {
    return "Fiesta";
  }
  if (block.module === "movimiento") {
    return "Movimiento";
  }
  return "Evento";
}

function generateTimelineLegacy(input: EventConfig): TimelineResult {
  const event = normalizeEventConfig(input);
  const blocks: TimelineBlock[] = [];
  const warnings: string[] = [];
  const assumptions: TimelineAssumption[] = [];

  addOpening(event, blocks, warnings);
  addCeremony(event, blocks, warnings);
  addCocktail(event, blocks, warnings);
  addBanquet(event, blocks, warnings, assumptions);
  addParty(event, blocks, warnings);
  addResopon(event, blocks, warnings);

  if (event.pax > 200) {
    assumptions.push(
      assumption(
        "more-than-200-pax",
        "Regla >200 pax aplicada",
        "Se usa el catalogo 200pax para duplicar puestos y reforzar notas operativas cuando aplica.",
        "catalog",
      ),
    );
  }

  const sortedBlocks = computeOverlaps(
    blocks.sort((a, b) => {
      const time = sortHHMM(a.start, b.start, event.openDoorsTime);
      return time === 0 ? a.label.localeCompare(b.label) : time;
    }),
    event.openDoorsTime,
  );

  const modules = new Set(sortedBlocks.map((block) => block.module));
  const startsAt = sortedBlocks[0]?.start;
  const maxEnd = sortedBlocks.reduce(
    (max, block) => Math.max(max, toEventMinute(block.start, event.openDoorsTime) + block.durationMinutes),
    toEventMinute(event.openDoorsTime, event.openDoorsTime),
  );

  return {
    blocks: sortedBlocks,
    appliedBlocks: Array.from(new Set(sortedBlocks.map((block) => block.reference).filter(Boolean) as string[])),
    assumptions,
    warnings,
    summary: {
      startsAt,
      endsAt: sortedBlocks.length > 0 ? fromMinutes(maxEnd) : undefined,
      totalBlocks: sortedBlocks.length,
      totalMinutes: sortedBlocks.reduce((sum, block) => sum + block.durationMinutes, 0),
      moduleCount: modules.size,
      assumptionCount: assumptions.length,
      warningCount: warnings.length,
      has200PaxAdjustments: event.pax > 200,
    },
  }.blocks
    ? {
        blocks: sortedBlocks.map((block) => ({
          ...block,
          notes: `${normalizeMomentLabel(block)} · ${block.notes ?? ""}`.trim().replace(/ ·$/, ""),
        })),
        appliedBlocks: Array.from(new Set(sortedBlocks.map((block) => block.reference).filter(Boolean) as string[])),
        assumptions,
        warnings,
        summary: {
          startsAt,
          endsAt: sortedBlocks.length > 0 ? fromMinutes(maxEnd) : undefined,
          totalBlocks: sortedBlocks.length,
          totalMinutes: sortedBlocks.reduce((sum, block) => sum + block.durationMinutes, 0),
          moduleCount: modules.size,
          assumptionCount: assumptions.length,
          warningCount: warnings.length,
          has200PaxAdjustments: event.pax > 200,
        },
      }
    : {
        blocks: sortedBlocks,
        appliedBlocks: Array.from(new Set(sortedBlocks.map((block) => block.reference).filter(Boolean) as string[])),
        assumptions,
        warnings,
        summary: {
          startsAt,
          endsAt: sortedBlocks.length > 0 ? fromMinutes(maxEnd) : undefined,
          totalBlocks: sortedBlocks.length,
          totalMinutes: sortedBlocks.reduce((sum, block) => sum + block.durationMinutes, 0),
          moduleCount: modules.size,
          assumptionCount: assumptions.length,
          warningCount: warnings.length,
          has200PaxAdjustments: event.pax > 200,
        },
      };
}

export function generateTimeline(input: EventConfig): TimelineResult {
  const event = normalizeEventConfig(input);
  const blocks: TimelineBlock[] = [];
  const warnings: string[] = [];
  const assumptions: TimelineAssumption[] = [];

  addOpening(event, blocks, warnings);
  addCeremony(event, blocks, warnings);
  addCocktail(event, blocks, warnings);
  addBanquet(event, blocks, warnings, assumptions);
  addParty(event, blocks, warnings);
  addResopon(event, blocks, warnings);

  if (event.pax > 200) {
    assumptions.push(
      assumption(
        "more-than-200-pax",
        "Regla >200 pax aplicada",
        "Se usa el catalogo 200pax para duplicar puestos y reforzar notas operativas cuando aplica.",
        "catalog",
      ),
    );
  }

  const sortedBlocks = computeOverlaps(
    blocks.sort((a, b) => {
      const time = sortHHMM(a.start, b.start, event.openDoorsTime);
      return time === 0 ? a.label.localeCompare(b.label) : time;
    }),
    event.openDoorsTime,
  );

  const timelineBlocks = sortedBlocks.map((block) => ({
    ...block,
    notes: `${normalizeMomentLabel(block)} · ${block.notes ?? ""}`.trim().replace(/ ·$/, ""),
  }));

  const startsAt = timelineBlocks[0]?.start;
  const maxEnd = timelineBlocks.reduce(
    (max, block) => Math.max(max, toEventMinute(block.start, event.openDoorsTime) + block.durationMinutes),
    toEventMinute(event.openDoorsTime, event.openDoorsTime),
  );

  return {
    blocks: timelineBlocks,
    appliedBlocks: Array.from(new Set(timelineBlocks.map((block) => block.reference).filter(Boolean) as string[])),
    assumptions,
    warnings,
    summary: {
      startsAt,
      endsAt: timelineBlocks.length > 0 ? fromMinutes(maxEnd) : undefined,
      totalBlocks: timelineBlocks.length,
      totalMinutes: timelineBlocks.reduce((sum, block) => sum + block.durationMinutes, 0),
      moduleCount: new Set(timelineBlocks.map((block) => block.module)).size,
      assumptionCount: assumptions.length,
      warningCount: warnings.length,
      has200PaxAdjustments: event.pax > 200,
    },
  };
}
