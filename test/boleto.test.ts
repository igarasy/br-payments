import { describe, expect, it } from 'vitest';
import {
  BrPaymentsError,
  barcodeToDigitableLine,
  createBankBoleto,
  digitableLineToBarcode,
  dueDateToFactor,
  factorToDueDate,
  formatDigitableLine,
  isValidBoleto,
  mod10,
  mod11Boleto,
  parseBoleto,
} from '../src/index.js';

// Real-world codes from a public, independently written test suite
// (hfsnetbr/boleto-utils), so the implementation isn't only checked against itself.
const CAIXA = { line: '10492006506100010004200997263900989810000021403', barcode: '10499898100000214032006561000100040099726390' };
const BRADESCO_NO_AMOUNT = { line: '23794150099001980167035000211405700000000000000', barcode: '23797000000000000004150090019801673500021140' };
const ARRECADACAO_MOD11 = { line: '838600000050096000190009000801782309000343062712', barcode: '83860000005096000190000008017823000034306271' };
const ARRECADACAO_MOD10 = { line: '846300000003299902962024004101360008002006441147', barcode: '84630000000299902962020041013600000200644114' };
const ARRECADACAO_SEG5 = { line: '858200000007572503282030560708202107539591904460', barcode: '85820000000572503282035607082021053959190446' };

describe('check digits', () => {
  it('mod10 follows the Febraban example', () => {
    expect(mod10('01230067896')).toBe(3);
  });
  it('mod11 for boletos never returns 0', () => {
    for (let i = 0; i < 500; i++) expect(mod11Boleto(String(i * 7919).padStart(43, '0'))).toBeGreaterThan(0);
  });
});

describe('bank boleto', () => {
  it('parses a digitable line', () => {
    const b = parseBoleto(CAIXA.line, { referenceDate: '2026-01-01' });
    expect(b).toMatchObject({
      valid: true,
      type: 'bancario',
      barcode: CAIXA.barcode,
      digitableLine: CAIXA.line,
      amountCents: 21403,
      dueDate: '2022-05-10',
      bankCode: '104',
      bankName: 'Caixa Econômica Federal',
    });
  });

  it('parses the barcode into the same result', () => {
    expect(parseBoleto(CAIXA.barcode, { referenceDate: '2026-01-01' }).digitableLine).toBe(CAIXA.line);
  });

  it('handles boletos without amount or due date', () => {
    expect(parseBoleto(BRADESCO_NO_AMOUNT.line)).toMatchObject({
      valid: true,
      barcode: BRADESCO_NO_AMOUNT.barcode,
      amountCents: null,
      dueDate: null,
      bankName: 'Bradesco',
    });
  });

  it('accepts formatted input', () => {
    expect(isValidBoleto(formatDigitableLine(CAIXA.line))).toBe(true);
    expect(formatDigitableLine(CAIXA.line)).toBe('10492.00650 61000.100042 00997.263900 9 89810000021403');
  });

  it('flags each wrong check digit', () => {
    const wrongField2 = CAIXA.line.slice(0, 20) + ((Number(CAIXA.line[20]) + 1) % 10) + CAIXA.line.slice(21);
    expect(parseBoleto(wrongField2).errors).toContain('field 2 check digit is wrong');
    const wrongGeneral = CAIXA.barcode.slice(0, 4) + ((Number(CAIXA.barcode[4]) + 1) % 10 || 1) + CAIXA.barcode.slice(5);
    expect(parseBoleto(wrongGeneral).errors).toContain('general check digit is wrong');
  });

  it('round-trips generated boletos', () => {
    const { barcode, digitableLine } = createBankBoleto({ bankCode: '341', amountCents: 9990, dueDate: '2026-12-15', freeField: '1090000012345678901234567' });
    const parsed = parseBoleto(digitableLine, { referenceDate: '2026-10-24' });
    expect(parsed).toMatchObject({ valid: true, barcode, amountCents: 9990, dueDate: '2026-12-15', bankName: 'Itaú Unibanco' });
    expect(digitableLineToBarcode(digitableLine)).toBe(barcode);
    expect(barcodeToDigitableLine(barcode)).toBe(digitableLine);
  });
});

describe('due-date factor', () => {
  it('follows the Febraban milestones, including the 2025 wrap-around', () => {
    expect(dueDateToFactor('2000-07-03')).toBe(1000);
    expect(dueDateToFactor('2025-02-21')).toBe(9999);
    expect(dueDateToFactor('2025-02-22')).toBe(1000);
    expect(factorToDueDate(1000, '2025-03-01')).toBe('2025-02-22');
    expect(factorToDueDate(1000, '2001-01-01')).toBe('2000-07-03');
    expect(factorToDueDate(9999, '2025-02-01')).toBe('2025-02-21');
    expect(factorToDueDate(0)).toBeNull();
  });

  it('rejects impossible dates', () => {
    expect(() => dueDateToFactor('2026-02-30')).toThrow(BrPaymentsError);
    expect(() => dueDateToFactor('15/12/2026')).toThrow(BrPaymentsError);
  });
});

describe('arrecadação (collection) boleto', () => {
  it('parses a mod-11 line', () => {
    expect(parseBoleto(ARRECADACAO_MOD11.line)).toMatchObject({
      valid: true,
      type: 'arrecadacao',
      barcode: ARRECADACAO_MOD11.barcode,
      amountCents: 50960,
      segment: '3',
      amountIsCurrency: true,
    });
  });

  it('converts barcodes to lines (mod 10 and mod 11)', () => {
    expect(barcodeToDigitableLine(ARRECADACAO_SEG5.barcode)).toBe(ARRECADACAO_SEG5.line);
    expect(digitableLineToBarcode(ARRECADACAO_MOD10.line)).toBe(ARRECADACAO_MOD10.barcode);
    expect(parseBoleto(ARRECADACAO_MOD10.line).valid).toBe(true);
  });

  it('flags a wrong block digit', () => {
    const l = ARRECADACAO_MOD10.line;
    const broken = l.slice(0, 23) + ((Number(l[23]) + 1) % 10) + l.slice(24);
    expect(parseBoleto(broken).errors).toContain('block 2 check digit is wrong');
  });
});

describe('input safety', () => {
  it('throws typed errors for impossible input', () => {
    expect(() => parseBoleto('123')).toThrow(/expected 44, 47 or 48 digits/);
    expect(() => parseBoleto('1049200650<script>')).toThrow(BrPaymentsError);
    expect(() => parseBoleto('1'.repeat(5000))).toThrow(/exceeds/);
    expect(() => parseBoleto(null as unknown as string)).toThrow(BrPaymentsError);
  });

  it('isValidBoleto never throws', () => {
    for (const v of ['', 'abc', '1'.repeat(47), '8'.repeat(48), null, 42]) {
      expect(() => isValidBoleto(v as string)).not.toThrow();
    }
  });
});
