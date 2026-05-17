import { fallbackEventCatalog } from "../data/catalog";
import { normalizeEventConfig } from "./defaults";
import { annotateBlocksWithStaffing, computeStaffingSummary } from "./staffing";
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
  CatalogEventBlock,
  EventCatalog,
  EventStand,
  EventConfig,
  HHMM,
  Phase,
  TimelineAssumption,
  TimelineBlock,
  TimelineResult,
} from "./types";

const STAND_REFS: Record<string, { ref: string; label: string }> = {
  arroz: { ref: "P_AR", label: "Puesto arroz" },
  jamon_1x50: { ref: "P_JA", label: "Puesto jamon" },
  jamon_2h: { ref: "P_JA_2j", label: "Puesto jamon 2h" },
  quesos_clasico: { ref: "P_QU_C", label: "Puesto quesos clasico" },
  quesos_embutidos: { ref: "P_QU-EM", label: "Puesto quesos y embutidos" },
  croquetas: { ref: "P_CR", label: "Puesto croquetas" },
  cerveza: { ref: "P_CE", label: "Puesto cerveza" },
  huevos: { ref: "P_HU", label: "Puesto huevos" },
  mojitos: { ref: "P_MO", label: "Puesto mojitos" },
  navajas_zamburinas: { ref: "P_NA-ZA", label: "Puesto navajas/zamburinas" },
  sushi: { ref: "P_SU", label: "Puesto sushi" },
  tortilla: { ref: "P_TO", label: "Puesto tortilla" },
  vermut: { ref: "P_VE", label: "Puesto vermut" },
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

function referencesInclude(entry: CatalogEventBlock, ref: string): boolean {
  return (entry.references ?? "")
    .split(",")
    .map((part) => part.trim())
    .includes(ref);
}

function findCatalog(
  catalog: EventCatalog,
  ref: string,
  phase?: Phase,
  blockId?: string,
): CatalogEventBlock | undefined {
  if (blockId) {
    return catalog.blocks.find((entry) => entry.blockId === blockId);
  }
  const phaseText = phase && phase !== "transicion" && phase !== "briefing" ? phase : undefined;
  return catalog.blocks.find((entry) => {
    const phaseMatches = !phaseText || entry.moments === phaseText;
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

function catalogNote(entry?: CatalogEventBlock, prefer200 = false): string | undefined {
  if (!entry) {
    return undefined;
  }
  if (prefer200 && entry.over200Adjustment && entry.over200Adjustment !== "Sin cambio estructural") {
    return `${entry.notasOperativas ?? ""} ${entry.over200Notes ?? ""}`.trim();
  }
  return entry.notasOperativas ?? undefined;
}

function catalogStaff(entry?: CatalogEventBlock): Pick<
  TimelineBlock,
  "blockId" | "staffText" | "staffMin" | "staffMax" | "staffingRule" | "taskCount"
> {
  if (!entry) {
    return {};
  }
  return {
    blockId: entry.blockId,
    staffText: entry.minPersonasBloque ?? undefined,
    staffMin: entry.staffMin ?? null,
    staffMax: entry.staffMax ?? null,
    staffingRule: entry.reglaDotacion ?? undefined,
    taskCount: entry.numTareasCamareros ?? entry.taskCodes?.length ?? null,
  };
}

function laterTime(a: HHMM, b: HHMM, anchor: HHMM): HHMM {
  return sortHHMM(a, b, anchor) >= 0 ? a : b;
}

function asPositiveDuration(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function catalogDurationMinutes(entry: CatalogEventBlock | undefined, prefer200 = false): number | null {
  if (!entry) {
    return null;
  }

  const minDuration = asPositiveDuration(entry.duracionMinima);
  const maxDuration = asPositiveDuration(entry.duracionMax);
  if (minDuration != null && maxDuration != null) {
    return Math.round((minDuration + maxDuration) / 2);
  }

  return asPositiveDuration(prefer200 ? entry.over200DurationReferenceMin : null) ?? asPositiveDuration(entry.duracionReferenciaMin);
}

function strictCatalogRange(
  entry: CatalogEventBlock | undefined,
  phase: Phase,
  start: HHMM,
  end: HHMM,
  prefer200 = false,
) {
  const minutes = catalogDurationMinutes(entry, prefer200);
  if (!minutes || minutes <= 0) {
    return { start, end };
  }
  if (phase === "previa") {
    return { start: addMinutes(end, -minutes), end };
  }
  if (phase === "posterior") {
    return { start, end: addMinutes(start, minutes) };
  }
  return { start, end };
}

function buildBlock(input: {
  catalog: EventCatalog;
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
  catalogBlockId?: string;
  prefer200?: boolean;
}): TimelineBlock {
  const entry = input.reference
    ? findCatalog(input.catalog, input.reference, input.phase, input.catalogBlockId)
    : undefined;
  const range = strictCatalogRange(entry, input.phase, input.start, input.end, input.prefer200);
  return {
    id: input.id,
    label: input.label,
    module: input.module,
    phase: input.phase,
    start: range.start,
    end: range.end,
    reference: input.reference,
    parentBlockId: input.parentBlockId,
    team: input.team,
    notes: input.notes ?? catalogNote(entry),
    durationMinutes: diffMinutes(range.start, range.end),
    colorKey: MODULE_COLORS[input.module] ?? "taupe",
    assumptions: input.assumptions ?? [],
    overlapsWith: [],
    ...catalogStaff(entry),
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
    return;
  }
  blocks.push(block);
}

function maybeAddTransition(
  catalog: EventCatalog,
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
  if (!input.start || !input.end || diffMinutes(input.start, input.end) <= 0) {
    return;
  }
  addIfValid(
    blocks,
    warnings,
    buildBlock({
      catalog,
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

function addOpening(catalog: EventCatalog, event: EventConfig, blocks: TimelineBlock[], warnings: string[]) {
  const firstStart = firstServiceStart(event);
  if (isBefore(event.openDoorsTime, firstStart, event.openDoorsTime)) {
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        catalog,
        id: "opening",
        label: "Apertura de puertas",
        module: "apertura",
        phase: "transicion",
        start: event.openDoorsTime,
        end: firstStart,
        reference: "EVEN",
        catalogBlockId: "B01",
        team: "Sala",
        notes: "Arranque operativo visible del evento.",
      }),
      event.openDoorsTime,
    );
  }
}

function addCeremony(catalog: EventCatalog, event: EventConfig, blocks: TimelineBlock[], warnings: string[]) {
  const { ceremony } = event;
  if (!ceremony.enabled || !ceremony.start || !ceremony.end) {
    return;
  }

  if (ceremony.civil) {
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        catalog,
        id: "ceremony-previa",
        label: "Ceremonia civil - previa",
        module: "ceremonia",
        phase: "previa",
        start: addMinutes(event.openDoorsTime, -50),
        end: event.openDoorsTime,
        reference: "C_CI",
        parentBlockId: "ceremony",
        team: "T1",
        notes: catalogNote(findCatalog(catalog, "C_CI", "previa"), event.pax > 200),
      }),
      event.openDoorsTime,
    );

    addIfValid(
      blocks,
      warnings,
      buildBlock({
        catalog,
        id: "ceremony-service",
        label: "Ceremonia civil - servicio",
        module: "ceremonia",
        phase: "servicio",
        start: ceremony.start,
        end: ceremony.end,
        reference: "C_CI",
        parentBlockId: "ceremony",
        team: "2 pax",
        notes: catalogNote(findCatalog(catalog, "C_CI", "servicio"), event.pax > 200),
      }),
      event.openDoorsTime,
    );
  }

  if (ceremony.limonada) {
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        catalog,
        id: "limonada-previa",
        label: "Puesto limonada - previa",
        module: "limonada",
        phase: "previa",
        start: addMinutes(event.openDoorsTime, -38),
        end: event.openDoorsTime,
        reference: "P_LIM",
        parentBlockId: "limonada",
        team: "T1",
        notes: catalogNote(findCatalog(catalog, "P_LIM", "previa"), event.pax > 200),
      }),
      event.openDoorsTime,
    );

    addIfValid(
      blocks,
      warnings,
      buildBlock({
        catalog,
        id: "limonada-service",
        label: "Puesto limonada - servicio",
        module: "limonada",
        phase: "servicio",
        start: ceremony.start,
        end: ceremony.end,
        reference: "P_LIM",
        parentBlockId: "limonada",
        team: "2 pax",
        notes: catalogNote(findCatalog(catalog, "P_LIM", "servicio"), event.pax > 200),
      }),
      event.openDoorsTime,
    );
  }

  addMomentStands(catalog, event, blocks, warnings, {
    moment: "ceremony",
    momentLabel: "ceremonia",
    previaStart: addMinutes(event.openDoorsTime, -diffMinutes(event.openDoorsTime, ceremony.start)),
    previaEnd: event.openDoorsTime,
    serviceStart: ceremony.start,
    serviceEnd: ceremony.end,
  });

  if (event.briefing?.enabled) {
    const briefingEntry = findCatalog(catalog, "ACTA", "briefing", "B17b");
    const briefingMinutes = catalogDurationMinutes(briefingEntry, event.pax > 200) ?? 15;
    const start =
      event.briefing.mode === "secuencial" && event.briefing.start
        ? event.briefing.start
        : addMinutes(event.openDoorsTime, -briefingMinutes);
    const end = event.briefing.mode === "secuencial" && event.briefing.end ? event.briefing.end : event.openDoorsTime;
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        catalog,
        id: "briefing",
        label: "Briefing + descanso",
        module: "briefing",
        phase: "briefing",
        start,
        end,
        reference: "ACTA",
        catalogBlockId: "B17b",
        team: "Resto equipo",
        notes:
          event.briefing.mode === "simultaneo"
            ? "Se solapa con ceremonia para el equipo que no queda en servicio."
            : "Briefing configurado como bloque secuencial.",
      }),
      event.openDoorsTime,
    );
  }
}

function addMomentStands(
  catalog: EventCatalog,
  event: EventConfig,
  blocks: TimelineBlock[],
  warnings: string[],
  input: {
    moment: EventStand["moment"];
    momentLabel: string;
    previaStart?: HHMM;
    previaEnd?: HHMM;
    serviceStart?: HHMM;
    serviceEnd?: HHMM;
  },
) {
  if (!input.previaStart || !input.serviceStart || !input.serviceEnd) {
    return;
  }

  const activeStands = event.stands.filter((stand) => stand.enabled && stand.moment === input.moment);
  for (const standConfig of activeStands) {
    const stand = STAND_REFS[standConfig.id];
    if (!stand) {
      warnings.push(`Puesto sin referencia de catalogo: ${standConfig.id}`);
      continue;
    }

    const prefer200 = event.pax > 200;
    const catalogEntry = findCatalog(catalog, stand.ref);
    const duplicate = prefer200 && (catalogEntry?.over200Adjustment ?? "").toLowerCase().includes("duplica");
    const copies = duplicate ? ["1", "2"] : ["1"];

    for (const copy of copies) {
      const suffix = duplicate ? ` ${copy}` : "";
      const parentBlockId = `stand-${stand.ref}-${input.moment}-${copy}`;
      const duplicateAssumptions = duplicate ? ["Se duplica una vez por regla >200 pax."] : [];

      addIfValid(
        blocks,
        warnings,
        buildBlock({
          catalog,
          id: `${parentBlockId}-previa`,
          label: `${stand.label}${suffix} ${input.momentLabel} - previa`,
          module: "puesto",
          phase: "previa",
          start: input.previaStart,
          end: input.previaEnd ?? input.serviceStart,
          reference: stand.ref,
          parentBlockId,
          team: "Puesto",
          notes:
            catalogNote(findCatalog(catalog, stand.ref, "previa"), prefer200) ??
            `Montaje del puesto durante ${input.momentLabel}.`,
          assumptions: duplicateAssumptions,
        }),
        event.openDoorsTime,
      );

      addIfValid(
        blocks,
        warnings,
        buildBlock({
          catalog,
          id: `${parentBlockId}-service`,
          label: `${stand.label}${suffix} ${input.momentLabel} - servicio`,
          module: "puesto",
          phase: "servicio",
          start: input.serviceStart,
          end: input.serviceEnd,
          reference: stand.ref,
          parentBlockId,
          team: "Puesto",
          notes: catalogNote(findCatalog(catalog, stand.ref, "servicio"), prefer200),
          assumptions: duplicateAssumptions,
        }),
        event.openDoorsTime,
      );

    }
  }
}

function addCocktail(catalog: EventCatalog, event: EventConfig, blocks: TimelineBlock[], warnings: string[]) {
  const { cocktail, ceremony } = event;
  if (!cocktail.enabled || !cocktail.start || !cocktail.end) {
    return;
  }

  const cocktailStart = cocktail.start;
  const cocktailEnd = cocktail.end;
  const previousStart = ceremony.enabled && ceremony.start ? ceremony.start : event.openDoorsTime;

  if (ceremony.enabled && ceremony.end && cocktailStart !== ceremony.end) {
    maybeAddTransition(catalog, event, blocks, warnings, {
      id: "transition-ceremony-cocktail",
      label: "Movimiento ceremonia -> coctel",
      start: ceremony.end,
      end: cocktailStart,
      notes: "Desplazamiento y acomodo de invitados entre ceremonia y coctel.",
    });
  }

  addIfValid(
    blocks,
    warnings,
    buildBlock({
      catalog,
      id: "cocktail-previa",
      label: "Coctel - previa",
      module: "coctel",
      phase: "previa",
      start: addMinutes(event.openDoorsTime, -35),
      end: event.openDoorsTime,
      reference: "COC_L",
      catalogBlockId: "B17",
      parentBlockId: "cocktail",
      team: "T1",
      notes:
        catalogNote(findCatalog(catalog, "COC_L", "previa", "B17"), event.pax > 200) ??
        "Montaje solapado mientras ceremonia y limonada siguen activas.",
    }),
    event.openDoorsTime,
  );

  ["comida", "bebida", "barra"].forEach((part, index) => {
    const catalogBlockId = index === 0 ? "B18" : index === 1 ? "B19" : "B20";
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        catalog,
        id: `cocktail-service-${part}`,
        label: `Coctel - ${part}`,
        module: "coctel",
        phase: "servicio",
        start: cocktailStart,
        end: cocktailEnd,
        reference: "COC_L",
        catalogBlockId,
        parentBlockId: "cocktail",
        team: index === 2 ? "Barra" : "Sala",
        notes: catalogNote(findCatalog(catalog, "COC_L", "servicio", catalogBlockId), event.pax > 200),
      }),
      event.openDoorsTime,
    );
  });

  addMomentStands(catalog, event, blocks, warnings, {
    moment: "cocktail",
    momentLabel: "coctel",
    previaStart: addMinutes(event.openDoorsTime, -diffMinutes(previousStart, cocktailStart)),
    previaEnd: event.openDoorsTime,
    serviceStart: cocktailStart,
    serviceEnd: cocktailEnd,
  });
}

function addBanquet(
  catalog: EventCatalog,
  event: EventConfig,
  blocks: TimelineBlock[],
  warnings: string[],
  assumptions: TimelineAssumption[],
): HHMM | undefined {
  const { banquet, cocktail } = event;
  if (!banquet.enabled || !banquet.start || !banquet.end) {
    return undefined;
  }

  const previousStart = cocktail.enabled && cocktail.start ? cocktail.start : addMinutes(banquet.start, -60);

  if (cocktail.enabled && cocktail.end && banquet.start !== cocktail.end) {
    maybeAddTransition(catalog, event, blocks, warnings, {
      id: "transition-cocktail-banquet",
      label: "Movimiento coctel -> banquete",
      start: cocktail.end,
      end: banquet.start,
      notes: "Paso de invitados desde coctel hacia el espacio de banquete.",
    });
  }

  addIfValid(
    blocks,
    warnings,
    buildBlock({
      catalog,
      id: "banquet-previa",
      label: "Banquete - previa",
      module: "banquete",
      phase: "previa",
      start: previousStart,
      end: banquet.start,
      reference: "BAN",
      catalogBlockId: "B22",
      parentBlockId: "banquet",
      team: "Sala",
      notes: catalogNote(findCatalog(catalog, "BAN", "previa", "B22"), event.pax > 200),
    }),
    event.openDoorsTime,
  );

  let segmentStart = banquet.start;
  for (const [index, segment] of banquet.segments.entries()) {
    const segmentEnd = addMinutes(segmentStart, segment.minutes);
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        catalog,
        id: `banquet-service-${segment.name}-${index}`,
        label: `Banquete - ${segment.name}`,
        module: "banquete",
        phase: "servicio",
        start: segmentStart,
        end: segmentEnd,
        reference: segment.name.toUpperCase(),
        catalogBlockId: "B23b",
        parentBlockId: "banquet",
        team: "Rangos",
        notes: "Servicio visible del banquete.",
      }),
      event.openDoorsTime,
    );
    segmentStart = segmentEnd;
  }

  if ((banquet.momentsExtraMinutes ?? 0) > 0) {
    const momentsEnd = addMinutes(segmentStart, banquet.momentsExtraMinutes ?? 0);
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        catalog,
        id: "banquet-service-momentos",
        label: "Banquete - momentos",
        module: "banquete",
        phase: "servicio",
        start: segmentStart,
        end: momentsEnd,
        reference: "BAN",
        catalogBlockId: "B23b",
        parentBlockId: "banquet",
        team: "Sala",
        notes: "Espacio reservado para hitos, brindis o momentos especiales.",
      }),
      event.openDoorsTime,
    );
    segmentStart = momentsEnd;
  }

  const declaredEnd = banquet.end;
  const operationalEnd = laterTime(segmentStart, declaredEnd, event.openDoorsTime);
  const configuredDuration = diffMinutes(banquet.start, banquet.end);
  const serviceDuration = diffMinutes(banquet.start, segmentStart);

  if (sortHHMM(segmentStart, declaredEnd, event.openDoorsTime) > 0) {
    assumptions.push(
      assumption(
        "banquet-duration-gap",
        "Banquete ajustado por duracion real",
        `La secuencia operativa del banquete extiende el servicio hasta ${segmentStart}, aunque la ventana declarada cerraba a las ${declaredEnd}.`,
        "banquet",
      ),
    );
  } else if (Math.abs(serviceDuration - configuredDuration) > 5) {
    assumptions.push(
      assumption(
        "banquet-duration-gap",
        "Banquete ajustado por configuracion",
        `Los segmentos suman ${serviceDuration} min y la ventana declarada dura ${configuredDuration} min.`,
        "banquet",
      ),
    );
  }

  addIfValid(
    blocks,
    warnings,
    buildBlock({
      catalog,
      id: "banquet-close",
      label: "Banquete - posterior",
      module: "banquete",
      phase: "posterior",
      start: operationalEnd,
      end: addMinutes(operationalEnd, 120),
      reference: "BAN",
      catalogBlockId: "B24",
      parentBlockId: "banquet",
      team: "T1",
      notes:
        catalogNote(findCatalog(catalog, "BAN", "posterior", "B24"), event.pax > 200) ??
        "Recogida posterior modelada con referencia operativa de 2 horas.",
      assumptions: ["Recogida de banquete modelada con referencia de 2 horas."],
    }),
    event.openDoorsTime,
  );

  return operationalEnd;
}

function addParty(
  catalog: EventCatalog,
  event: EventConfig,
  blocks: TimelineBlock[],
  warnings: string[],
  banquetOperationalEnd?: HHMM,
) {
  const { party, banquet } = event;
  if (!party.enabled || party.segments.length === 0) {
    return;
  }

  const firstPartyStart = party.segments[0].start;
  const lastPartyEnd = party.segments[party.segments.length - 1].end;
  const banquetEndForParty = banquet.enabled && banquet.end ? banquet.end : banquetOperationalEnd;
  const previaStart = banquetEndForParty
    ? addMinutes(banquetEndForParty, -45)
    : addMinutes(firstPartyStart, -45);

  if (banquetEndForParty && firstPartyStart !== banquetEndForParty) {
    maybeAddTransition(catalog, event, blocks, warnings, {
      id: "transition-banquet-party",
      label: "Movimiento banquete -> fiesta",
      start: banquetEndForParty,
      end: firstPartyStart,
      notes: "Cambio de momento desde el cierre real de banquete hacia la fiesta.",
    });
  }

  addIfValid(
    blocks,
    warnings,
    buildBlock({
      catalog,
      id: "party-previa",
      label: "Fiesta - previa + entrada T2",
      module: "fiesta",
      phase: "previa",
      start: previaStart,
      end: firstPartyStart,
      reference: "FIE-7",
      catalogBlockId: "B25",
      parentBlockId: "party",
      team: "T2",
      notes:
        catalogNote(findCatalog(catalog, "FIE-7", "previa", "B25"), event.pax > 200) ??
        "Entrada de T2 45 min antes del fin real del banquete.",
    }),
    event.openDoorsTime,
  );

  addMomentStands(catalog, event, blocks, warnings, {
    moment: "party",
    momentLabel: "fiesta",
    previaStart: addMinutes(event.openDoorsTime, -45),
    previaEnd: event.openDoorsTime,
    serviceStart: firstPartyStart,
    serviceEnd: lastPartyEnd,
  });

  party.segments.forEach((segment, index) => {
    addIfValid(
      blocks,
      warnings,
      buildBlock({
        catalog,
        id: `party-service-${index}`,
        label: `Fiesta - ${segment.name}`,
        module: "fiesta",
        phase: "servicio",
        start: segment.start,
        end: segment.end,
        reference: "FIE-7",
        catalogBlockId: "B26",
        parentBlockId: "party",
        team: "Barra",
        notes: catalogNote(findCatalog(catalog, "FIE-7", "servicio", "B26"), event.pax > 200),
      }),
      event.openDoorsTime,
    );
  });

  addIfValid(
    blocks,
    warnings,
    buildBlock({
      catalog,
      id: "party-close",
      label: "Fiesta - posterior",
      module: "fiesta",
      phase: "posterior",
      start: lastPartyEnd,
      end: addMinutes(lastPartyEnd, 45),
      reference: "FIE-7",
      catalogBlockId: "B27",
      parentBlockId: "party",
      team: "Barra",
      notes: catalogNote(findCatalog(catalog, "FIE-7", "posterior", "B27"), event.pax > 200),
    }),
    event.openDoorsTime,
  );
}

function addResopon(catalog: EventCatalog, event: EventConfig, blocks: TimelineBlock[], warnings: string[]) {
  const { party, resopon } = event;
  if (!resopon.enabled || !resopon.type || !resopon.serviceWindow) {
    return;
  }

  const ref = RESOPON_REFS[resopon.type] ?? "RES_TRA";
  const serviceStart = resopon.serviceWindow[0];
  const configuredEnd = resopon.serviceWindow[1];
  const serviceEnd = serviceStart === configuredEnd ? addMinutes(serviceStart, 30) : configuredEnd;
  const requestedPreviaStart = addMinutes(serviceStart, -15);
  const partyStart = party.enabled ? party.segments[0]?.start : undefined;
  const previousStart =
    partyStart && isHHMM(partyStart)
      ? laterTime(requestedPreviaStart, partyStart, event.openDoorsTime)
      : requestedPreviaStart;

  addIfValid(
    blocks,
    warnings,
    buildBlock({
      catalog,
      id: "resopon-previa",
      label: `Resopon ${resopon.type} - previa`,
      module: "resopon",
      phase: "previa",
      start: previousStart,
      end: serviceStart,
      reference: ref,
      parentBlockId: "resopon",
      team: "T2",
      notes:
        catalogNote(findCatalog(catalog, ref, "previa"), event.pax > 200) ??
        "La previa del resopon se realiza durante la fiesta.",
    }),
    event.openDoorsTime,
  );

  addIfValid(
    blocks,
    warnings,
    buildBlock({
      catalog,
      id: "resopon-service",
      label: `Resopon ${resopon.type} - servicio`,
      module: "resopon",
      phase: "servicio",
      start: serviceStart,
      end: serviceEnd,
      reference: ref,
      parentBlockId: "resopon",
      team: "T2",
      notes: catalogNote(findCatalog(catalog, ref, "servicio"), event.pax > 200),
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
  switch (block.module) {
    case "ceremonia":
      return "Ceremonia";
    case "limonada":
      return "Limonada";
    case "coctel":
      return "Coctel";
    case "puesto":
      return "Puesto";
    case "banquete":
      return "Banquete";
    case "fiesta":
      return "Fiesta";
    case "resopon":
      return "Resopon";
    case "movimiento":
      return "Movimiento";
    default:
      return "Evento";
  }
}

function annotateNotes(block: TimelineBlock): TimelineBlock {
  const prefix = normalizeMomentLabel(block);
  const note = block.notes?.trim();
  return {
    ...block,
    notes: note ? `${prefix} - ${note}` : prefix,
  };
}

export function generateTimeline(input: EventConfig, catalog: EventCatalog = fallbackEventCatalog): TimelineResult {
  const event = normalizeEventConfig(input);
  const blocks: TimelineBlock[] = [];
  const warnings: string[] = [];
  const assumptions: TimelineAssumption[] = [];

  addOpening(catalog, event, blocks, warnings);
  addCeremony(catalog, event, blocks, warnings);
  addCocktail(catalog, event, blocks, warnings);
  const banquetOperationalEnd = addBanquet(catalog, event, blocks, warnings, assumptions);
  addParty(catalog, event, blocks, warnings, banquetOperationalEnd);
  addResopon(catalog, event, blocks, warnings);

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

  const sortedBlocks = annotateBlocksWithStaffing(event, computeOverlaps(
    blocks.sort((a, b) => {
      const time = sortHHMM(a.start, b.start, event.openDoorsTime);
      return time === 0 ? a.label.localeCompare(b.label) : time;
    }),
    event.openDoorsTime,
  ).map(annotateNotes));

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
      moduleCount: new Set(sortedBlocks.map((block) => block.module)).size,
      assumptionCount: assumptions.length,
      warningCount: warnings.length,
      has200PaxAdjustments: event.pax > 200,
    },
    staffing: computeStaffingSummary(event, sortedBlocks),
  };
}
