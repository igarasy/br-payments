import { BrPaymentsError, assertString } from '../core/errors.js';
import { mod10, mod11Arrecadacao, mod11Boleto } from '../core/modulo.js';
import { BANK_NAMES } from './banks.js';
import { dueDateToFactor, factorToDueDate } from './due-date.js';

// Febraban layouts.
//
// Bank boleto (cobrança) barcode, 44 digits:
//   [0,3) bank  [3] currency (9 = BRL)  [4] general check digit (mod 11)
//   [5,9) due-date factor  [9,19) amount in cents  [19,44) free field
// Its digitable line has 47 digits in 5 fields; fields 1–3 carry mod-10 digits.
//
// Collection (arrecadação: utilities, taxes) barcode, 44 digits, starts with 8:
//   [0] "8"  [1] segment  [2] amount id (6/7 → mod 10, 8/9 → mod 11)
//   [3] general check digit  [4,15) amount  [15,44) company and free data
// Its digitable line has 48 digits: 4 blocks of 11 digits + 1 check digit.

export type BoletoType = 'bancario' | 'arrecadacao';

export interface ParsedBoleto {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly type: BoletoType;
  readonly barcode: string;
  readonly digitableLine: string;
  /** Amount in centavos; null when the code carries no amount. */
  readonly amountCents: number | null;
  /** Bank boletos only: YYYY-MM-DD, or null when the factor is 0. */
  readonly dueDate?: string | null;
  readonly bankCode?: string;
  readonly bankName?: string;
  /** Arrecadação only: Febraban segment (1 prefeituras … 9 bank use). */
  readonly segment?: string;
  /** Arrecadação only: false when the amount field is a reference/quantity. */
  readonly amountIsCurrency?: boolean;
}

export interface ParseBoletoOptions {
  /** Used to resolve the due-date factor cycle. Default: today (UTC). */
  referenceDate?: string;
}

const SEGMENTS = new Set(['1', '2', '3', '4', '5', '6', '7', '9']);

function normalize(input: string): string {
  assertString(input, 'boleto');
  // Only digits plus the usual separators are accepted.
  if (!/^[\d\s.\-]*$/.test(input)) {
    throw new BrPaymentsError('INVALID_INPUT', 'boleto may only contain digits, spaces, dots and hyphens');
  }
  return input.replace(/\D/g, '');
}

// ---------------------------------------------------------------- bank boleto

function bankLineToBarcode(line: string): string {
  return line.slice(0, 4) + line[32] + line.slice(33, 47) + line.slice(4, 9) + line.slice(10, 20) + line.slice(21, 31);
}

function bankBarcodeToLine(barcode: string): string {
  const free = barcode.slice(19);
  const f1 = barcode.slice(0, 4) + free.slice(0, 5);
  const f2 = free.slice(5, 15);
  const f3 = free.slice(15, 25);
  return f1 + mod10(f1) + f2 + mod10(f2) + f3 + mod10(f3) + barcode[4] + barcode.slice(5, 19);
}

function parseBank(barcode: string, line: string | null, opts: ParseBoletoOptions): ParsedBoleto {
  const errors: string[] = [];
  if (line) {
    const checks: Array<[number, number, number]> = [[0, 9, 9], [10, 20, 20], [21, 31, 31]];
    checks.forEach(([start, end, dvPos], i) => {
      if (mod10(line.slice(start, end)) !== Number(line[dvPos])) errors.push(`field ${i + 1} check digit is wrong`);
    });
  }
  if (mod11Boleto(barcode.slice(0, 4) + barcode.slice(5)) !== Number(barcode[4])) {
    errors.push('general check digit is wrong');
  }
  if (barcode[3] !== '9') errors.push('currency code must be 9 (BRL)');

  const factor = Number(barcode.slice(5, 9));
  let dueDate: string | null = null;
  try {
    dueDate = factorToDueDate(factor, opts.referenceDate);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'invalid due date');
  }
  const cents = Number(barcode.slice(9, 19));
  const bankCode = barcode.slice(0, 3);
  const bankName = BANK_NAMES[bankCode];

  return {
    valid: errors.length === 0,
    errors,
    type: 'bancario',
    barcode,
    digitableLine: line ?? bankBarcodeToLine(barcode),
    amountCents: cents > 0 ? cents : null,
    dueDate,
    bankCode,
    ...(bankName ? { bankName } : {}),
  };
}

// ---------------------------------------------------------------- arrecadação

const arrecadacaoDv = (amountId: string) => (digits: string): number =>
  amountId === '6' || amountId === '7' ? mod10(digits) : mod11Arrecadacao(digits);

function parseArrecadacao(barcode: string, line: string | null): ParsedBoleto {
  const errors: string[] = [];
  const amountId = barcode[2]!;
  if (!['6', '7', '8', '9'].includes(amountId)) {
    errors.push('amount identifier (3rd digit) must be 6, 7, 8 or 9');
  }
  if (!SEGMENTS.has(barcode[1]!)) errors.push('unknown segment');
  const dv = arrecadacaoDv(amountId);

  if (line) {
    for (let b = 0; b < 4; b++) {
      const block = line.slice(b * 12, b * 12 + 11);
      if (dv(block) !== Number(line[b * 12 + 11])) errors.push(`block ${b + 1} check digit is wrong`);
    }
  }
  if (dv(barcode.slice(0, 3) + barcode.slice(4)) !== Number(barcode[3])) errors.push('general check digit is wrong');

  const amountIsCurrency = amountId === '6' || amountId === '8';
  const amount = Number(barcode.slice(4, 15));
  const digitableLine =
    line ??
    [0, 1, 2, 3].map((b) => { const block = barcode.slice(b * 11, b * 11 + 11); return block + dv(block); }).join('');

  return {
    valid: errors.length === 0,
    errors,
    type: 'arrecadacao',
    barcode,
    digitableLine,
    amountCents: amountIsCurrency && amount > 0 ? amount : null,
    segment: barcode[1]!,
    amountIsCurrency,
  };
}

// ---------------------------------------------------------------- public API

/**
 * Parses a boleto from its digitable line (47 or 48 digits) or barcode
 * (44 digits). Formatting characters are ignored. Throws only for input that
 * can't be a boleto at all (wrong length or characters); check digit problems
 * are reported in `errors` with `valid: false`.
 */
export function parseBoleto(input: string, opts: ParseBoletoOptions = {}): ParsedBoleto {
  const digits = normalize(input);
  switch (digits.length) {
    case 47:
      return parseBank(bankLineToBarcode(digits), digits, opts);
    case 48: {
      if (digits[0] !== '8') throw new BrPaymentsError('INVALID_INPUT', '48-digit lines must start with 8 (arrecadação)');
      const barcode = [0, 1, 2, 3].map((b) => digits.slice(b * 12, b * 12 + 11)).join('');
      return parseArrecadacao(barcode, digits);
    }
    case 44:
      return digits[0] === '8' ? parseArrecadacao(digits, null) : parseBank(digits, null, opts);
    default:
      throw new BrPaymentsError('INVALID_INPUT', `expected 44, 47 or 48 digits, got ${digits.length}`);
  }
}

/** True when the code is well formed and every check digit matches. */
export function isValidBoleto(input: string, opts?: ParseBoletoOptions): boolean {
  try {
    return parseBoleto(input, opts).valid;
  } catch {
    return false;
  }
}

/** Converts a digitable line (47/48 digits) into its 44-digit barcode. */
export const digitableLineToBarcode = (line: string): string => parseBoleto(line).barcode;

/** Converts a 44-digit barcode into its digitable line. */
export const barcodeToDigitableLine = (barcode: string): string => parseBoleto(barcode).digitableLine;

/** Formats a digitable line with the usual spacing. */
export function formatDigitableLine(input: string): string {
  const d = normalize(input);
  if (d.length === 47) {
    return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
  }
  if (d.length === 48) return [0, 1, 2, 3].map((b) => `${d.slice(b * 12, b * 12 + 11)}-${d[b * 12 + 11]}`).join(' ');
  return d;
}

export interface CreateBankBoletoOptions {
  /** 3-digit bank code. */
  bankCode: string;
  amountCents: number;
  /** YYYY-MM-DD, or null for no due date. */
  dueDate: string | null;
  /** 25-digit free field defined by the issuing bank. */
  freeField: string;
}

/** Builds a bank boleto barcode and digitable line (useful for tests and mocks). */
export function createBankBoleto(opts: CreateBankBoletoOptions): { barcode: string; digitableLine: string } {
  if (!/^\d{3}$/.test(opts.bankCode)) throw new BrPaymentsError('INVALID_FIELD', 'bankCode must have 3 digits');
  if (!/^\d{25}$/.test(opts.freeField)) throw new BrPaymentsError('INVALID_FIELD', 'freeField must have 25 digits');
  if (!Number.isSafeInteger(opts.amountCents) || opts.amountCents < 0 || opts.amountCents > 99_999_999_99) {
    throw new BrPaymentsError('INVALID_AMOUNT', 'amountCents must be an integer from 0 to 9999999999');
  }
  const factor = opts.dueDate === null ? '0000' : String(dueDateToFactor(opts.dueDate)).padStart(4, '0');
  const body = opts.bankCode + '9' + factor + String(opts.amountCents).padStart(10, '0') + opts.freeField;
  const barcode = body.slice(0, 4) + mod11Boleto(body) + body.slice(4);
  return { barcode, digitableLine: bankBarcodeToLine(barcode) };
}
