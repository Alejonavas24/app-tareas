import rawEvents from "./events.json";
import { normalizeEventConfig } from "../../domain/defaults";
import type { EventConfig } from "../../domain/types";

export const exampleEvents = (rawEvents as { events: EventConfig[] }).events.map((event) =>
  normalizeEventConfig(event),
);

