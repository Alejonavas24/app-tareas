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
  beerStand?: boolean;
}

export interface CocktailConfig {
  enabled: boolean;
  start?: HHMM;
  end?: HHMM;
  displacementAfterMinutes?: number;
  stands: string[];
  sorbeteBridgeMinutes?: number;
}

export interface BanquetSegment {
  name: "primero" | "sorbete" | "segundo" | "postre" | "cafe" | "tarta";
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
  ceremony: CeremonyConfig;
  cocktail: CocktailConfig;
  banquet: BanquetConfig;
  party: PartyConfig;
  resopon: ResoponConfig;
  briefing?: BriefingConfig;
}

export interface TimelineBlock {
  id: string;
  parentBlockId?: string;
  reference?: string;
  label: string;
  module: string;
  phase: Phase;
  team?: string;
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

export interface CatalogBlock {
  catalogVersion: "base" | "200pax";
  sourceOrder: string;
  macrofase?: string;
  bloque: string;
  referencias?: string;
  momentos?: string;
  tipoBloque?: string;
  turnoSugerido?: string;
  rolPrincipal?: string;
  minPersonasBloque?: string;
  reglaDotacion?: string;
  continuidadDependencia?: string;
  hitoRelevo?: string;
  tareasCamareros?: number | null;
  codigosCamareros?: string;
  codigosOtrosRoles?: string;
  notasOperativas?: string;
  ajuste200pax?: string;
  codigosCamareros200?: string;
  codigosOtrosRoles200?: string;
  notas200pax?: string;
}

