export type HHMM = string;

export type Phase =
  | "previa"
  | "servicio"
  | "posterior"
  | "briefing"
  | "transicion";

export interface CeremonyConfig {
  enabled: boolean;
  start?: HHMM;
  end?: HHMM;
  displacementAfterMinutes?: number;
  civil?: boolean;
  limonada?: boolean;
  /** @deprecated Use EventConfig.stands instead. */
  beerStand?: boolean;
}

export type StandMoment = "ceremony" | "cocktail" | "party";

export interface EventStand {
  id:
    | "arroz"
    | "cerveza"
    | "croquetas"
    | "huevos"
    | "jamon_1x50"
    | "jamon_2h"
    | "mojitos"
    | "navajas_zamburinas"
    | "quesos_clasico"
    | "quesos_embutidos"
    | "sushi"
    | "tortilla"
    | "vermut";
  enabled: boolean;
  moment: StandMoment;
}

export interface CocktailConfig {
  enabled: boolean;
  start?: HHMM;
  end?: HHMM;
  totalMinutes?: number;
  displacementAfterMinutes?: number;
  /** @deprecated Use EventConfig.stands instead. */
  stands: string[];
  sorbeteBridgeMinutes?: number;
}

export type BanquetSegmentName = "primero" | "segundo" | "tarta" | "sorbete" | "postre" | "cafe";

export interface BanquetSegment {
  name: BanquetSegmentName;
  minutes: number;
}

export interface BanquetConfig {
  enabled: boolean;
  start?: HHMM;
  end?: HHMM;
  displacementAfterMinutes?: number;
  momentsExtraMinutes?: number;
  cake?: boolean;
  segments: BanquetSegment[];
}

export interface PartySegment {
  name: string;
  start: HHMM;
  end: HHMM;
}

export interface PartyConfig {
  enabled: boolean;
  totalMinutes?: number;
  segments: PartySegment[];
}

export interface ResoponConfig {
  enabled: boolean;
  type?: "tradicional" | "americano" | "barra" | "italiano" | "mc";
  serviceWindow?: [HHMM, HHMM];
}

export interface BriefingConfig {
  enabled: boolean;
  mode: "simultaneo" | "secuencial";
  start?: HHMM;
  end?: HHMM;
}

export interface EventConfig {
  id: string;
  name: string;
  date: string;
  pax: number;
  openDoorsTime: HHMM;
  endTime?: HHMM;
  notes?: string;
  stands: EventStand[];
  ceremony: CeremonyConfig;
  cocktail: CocktailConfig;
  banquet: BanquetConfig;
  party: PartyConfig;
  resopon: ResoponConfig;
  briefing?: BriefingConfig;
}

export interface TimelineBlock {
  id: string;
  blockId?: string;
  parentBlockId?: string;
  reference?: string;
  label: string;
  module: string;
  phase: Phase;
  team?: string;
  staffText?: string;
  staffMin?: number | null;
  staffMax?: number | null;
  staffingRule?: string;
  taskCount?: number | null;
  start: HHMM;
  end: HHMM;
  durationMinutes: number;
  notes?: string;
  assumptions?: string[];
  overlapsWith?: string[];
  colorKey?: string;
}

export interface TimelineAssumption {
  id: string;
  label: string;
  detail: string;
  source?: string;
  reviewed?: boolean;
  dbId?: string;
}

export interface TimelineSummary {
  startsAt?: HHMM;
  endsAt?: HHMM;
  totalBlocks: number;
  totalMinutes: number;
  moduleCount: number;
  assumptionCount: number;
  warningCount: number;
  has200PaxAdjustments: boolean;
}

export interface TimelineResult {
  blocks: TimelineBlock[];
  appliedBlocks: string[];
  assumptions: TimelineAssumption[];
  warnings: string[];
  summary: TimelineSummary;
}

export interface TimelineSnapshot extends TimelineResult {
  dbId?: string;
  externalId?: string;
  eventConfig: EventConfig;
  updatedAt?: string;
  createdAt?: string;
}

export interface TimelineEventSummary {
  dbId: string;
  externalId: string;
  name: string;
  date: string;
  pax: number;
  openDoorsTime: HHMM;
  endTime?: HHMM;
  summary?: Partial<TimelineSummary>;
  warnings?: string[];
  updatedAt?: string;
  createdAt?: string;
}

export interface CatalogEventBlock {
  blockId: string;
  blockSort: string;
  sortOrder?: number | null;
  macrofase?: string | null;
  blockName: string;
  references?: string | null;
  moments?: string | null;
  blockType?: string | null;
  turnoSugerido?: string | null;
  rolPrincipal?: string | null;
  minPersonasBloque?: string | null;
  staffMin?: number | null;
  staffMax?: number | null;
  reglaDotacion?: string | null;
  continuidadDependencia?: string | null;
  hitoRelevo?: string | null;
  numTareasCamareros?: number | null;
  rangoCodigosCamareros?: string | null;
  codigosCamarerosLista?: string | null;
  taskCodes?: string[];
  codigosRelacionadosOtrosRoles?: string | null;
  notasOperativas?: string | null;
  duracionMinima?: number | null;
  duracionMax?: number | null;
  duracionReferenciaMin?: number | null;
  observacionActa?: string | null;
  over200Adjustment?: string | null;
  over200WaiterCodes?: string[];
  over200OtherRoleCodes?: string[];
  over200Notes?: string | null;
  over200DurationReferenceMin?: number | null;
  over200ObservacionActa?: string | null;
  over200NonTaskAdjustments?: unknown[];
}

export interface CatalogTask {
  taskCode: string;
  blockId: string;
  taskSort?: number | null;
  referencia?: string | null;
  momento?: string | null;
  responsable?: string | null;
  taskName: string;
  numPersonas?: string | null;
  staffMin?: number | null;
  staffMax?: number | null;
  dependencyCode?: string | null;
  details?: string | null;
  timeMinMin?: number | null;
  timeMaxMin?: number | null;
  observaciones?: string | null;
  macrofase?: string | null;
  tipoBloque?: string | null;
  turno?: string | null;
  over200Affected?: boolean;
  over200Scope?: string | null;
  over200Adjustment?: string | null;
  over200Notes?: string | null;
  requiredLevel?: number;
}

export interface EventCatalog {
  blocks: CatalogEventBlock[];
  tasks: CatalogTask[];
  hasOver200Adjustments: boolean;
  validation?: {
    blocks: number;
    tasks: number;
    tasksWithoutBlock: number;
    blockTaskCodes?: number;
    over200TaskAdjustments?: number;
    over200NonTaskAdjustments?: number;
  };
}

export interface DeviceSession {
  deviceId: string;
  employeeId: string;
  fullName: string;
  roles: string[];
  active: boolean;
}

export interface AssignableEmployee {
  employeeId: string;
  fullName: string;
  roles: string[];
  skillLevel: number;
}

export interface EventStaffAssignment {
  id: string;
  eventId: string;
  employeeId: string;
  fullName: string;
  roles: string[];
  shiftName: "T1" | "T2" | "manual" | string;
  shiftStart: HHMM;
  shiftEnd: HHMM;
  skillLevel: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface EventTaskInstance {
  id: string;
  eventId: string;
  blockKey: string;
  blockId?: string | null;
  blockLabel?: string | null;
  taskCode: string;
  taskName: string;
  details?: string | null;
  startTime: HHMM;
  endTime: HHMM;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  requiredLevel: number;
  startedAt?: string | null;
  completedAt?: string | null;
  completedByEmployeeId?: string | null;
}

export interface WorkerTask extends EventTaskInstance {
  eventName: string;
  eventDate: string;
  shiftName?: string;
  assignedByBlock?: boolean;
  assignedDirectly?: boolean;
}
