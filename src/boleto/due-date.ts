import { BrPaymentsError } from '../core/errors.js';

// Due-date factor (fator de vencimento), Febraban: days since 1997-10-07.
// Factor 1000 = 2000-07-03 and 9999 = 2025-02-21; on 2025-02-22 it wrapped back
// to 1000. Each cycle therefore spans 9000 days and a factor alone is
// ambiguous: we pick the cycle whose date is closest to a reference date.
// Dates are plain "YYYY-MM-DD" strings handled in UTC to avoid timezone drift.

const DAY_MS = 86_400_000;
const BASE_UTC = Date.UTC(1997, 9, 7);
const CYCLE = 9000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDays(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new BrPaymentsError('INVALID_DATE', 'date must be YYYY-MM-DD');
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new BrPaymentsError('INVALID_DATE', `${date} is not a real calendar date`);
  }
  return Math.round((utc - BASE_UTC) / DAY_MS);
}

function fromDays(days: number): string {
  return new Date(BASE_UTC + days * DAY_MS).toISOString().slice(0, 10);
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Factor for a due date (2000-07-03 onwards). */
export function dueDateToFactor(date: string): number {
  const days = toDays(date);
  if (days < 1000) throw new BrPaymentsError('INVALID_DATE', 'due dates before 2000-07-03 have no factor');
  return ((days - 1000) % CYCLE) + 1000;
}

/**
 * Date for a factor, choosing the cycle closest to `referenceDate`
 * (default: today, UTC). Factor 0 means "no due date" and returns null.
 */
export function factorToDueDate(factor: number, referenceDate: string = todayUtc()): string | null {
  if (!Number.isInteger(factor) || factor < 0 || factor > 9999) {
    throw new BrPaymentsError('INVALID_INPUT', 'factor must be an integer from 0 to 9999');
  }
  if (factor === 0) return null;
  if (factor < 1000) return fromDays(factor); // pre-2000 legacy factors
  const ref = toDays(referenceDate);
  const k = Math.max(0, Math.round((ref - factor) / CYCLE));
  let best = factor + k * CYCLE;
  for (const candidate of [best - CYCLE, best + CYCLE]) {
    if (candidate >= 1000 && Math.abs(candidate - ref) < Math.abs(best - ref)) best = candidate;
  }
  return fromDays(best);
}
