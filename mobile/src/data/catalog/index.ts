import rawCatalog from "./eventCatalog.json";
import type { EventCatalog } from "../../domain/types";

export const fallbackEventCatalog = rawCatalog as EventCatalog;

