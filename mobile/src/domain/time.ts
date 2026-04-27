import type { HHMM } from "./types";

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isHHMM(value: string | undefined): value is HHMM {
  return Boolean(value && HHMM_RE.test(value));
}

export function toMinutes(value: HHMM): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function fromMinutes(total: number): HHMM {
  const normalized = ((Math.round(total) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function addMinutes(value: HHMM, minutes: number): HHMM {
  return fromMinutes(toMinutes(value) + minutes);
}

export function diffMinutes(start: HHMM, end: HHMM): number {
  const startMinutes = toMinutes(start);
  let endMinutes = toMinutes(end);
  if (endMinutes < startMinutes) {
    endMinutes += 1440;
  }
  return endMinutes - startMinutes;
}

export function toEventMinute(value: HHMM, anchor: HHMM): number {
  const anchorMinutes = toMinutes(anchor);
  let minutes = toMinutes(value);
  if (minutes < anchorMinutes - 180) {
    minutes += 1440;
  }
  return minutes;
}

export function sortHHMM(a: HHMM, b: HHMM, anchor: HHMM): number {
  return toEventMinute(a, anchor) - toEventMinute(b, anchor);
}

export function isBefore(a: HHMM, b: HHMM, anchor: HHMM): boolean {
  return sortHHMM(a, b, anchor) < 0;
}

export function rangeOverlaps(
  aStart: HHMM,
  aEnd: HHMM,
  bStart: HHMM,
  bEnd: HHMM,
  anchor: HHMM,
): boolean {
  const a0 = toEventMinute(aStart, anchor);
  const a1 = a0 + diffMinutes(aStart, aEnd);
  const b0 = toEventMinute(bStart, anchor);
  const b1 = b0 + diffMinutes(bStart, bEnd);
  return a0 < b1 && b0 < a1;
}

