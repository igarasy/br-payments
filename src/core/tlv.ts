import { BrPaymentsError } from './errors.js';

/**
 * EMV MPM tag-length-value: 2-digit id, 2-digit length, value.
 * Lengths count characters; BR Code payloads are ASCII-only, so characters
 * and bytes match.
 */
export interface TlvField {
  readonly id: string;
  readonly value: string;
}

export function tlv(id: string, value: string): string {
  if (value.length > 99) {
    throw new BrPaymentsError('FIELD_TOO_LONG', `Field ${id} exceeds 99 characters`);
  }
  return id + String(value.length).padStart(2, '0') + value;
}

/**
 * Parses one TLV level. Strict: every length must fit inside the input and
 * ids/lengths must be digits, so malformed or hostile payloads fail fast
 * instead of being read out of bounds. Returns an ordered list (never an
 * object keyed by tag), which keeps tag names away from object prototypes.
 */
export function parseTlv(input: string): TlvField[] | null {
  const fields: TlvField[] = [];
  let i = 0;
  while (i < input.length) {
    if (i + 4 > input.length) return null;
    const id = input.slice(i, i + 2);
    const lenText = input.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenText)) return null;
    const len = Number(lenText);
    const start = i + 4;
    const end = start + len;
    if (end > input.length) return null;
    fields.push({ id, value: input.slice(start, end) });
    i = end;
  }
  return fields;
}

export const findField = (fields: readonly TlvField[], id: string): string | undefined =>
  fields.find((f) => f.id === id)?.value;
