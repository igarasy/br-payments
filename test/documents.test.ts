import { describe, expect, it } from 'vitest';
import { formatCnpj, formatCpf, isValidCnpj, isValidCpf } from '../src/index.js';

describe('CPF', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('accepts %s', (v) => expect(isValidCpf(v)).toBe(true));
  it.each(['529.982.247-24', '11111111111', '1234567890', '', 'abc.def.ghi-jk'])('rejects %s', (v) => expect(isValidCpf(v)).toBe(false));
  it('formats', () => expect(formatCpf('52998224725')).toBe('529.982.247-25'));
});

describe('CNPJ', () => {
  it.each(['11.222.333/0001-81', '11222333000181'])('accepts numeric %s', (v) => expect(isValidCnpj(v)).toBe(true));

  // Alphanumeric CNPJ (Receita Federal, valid from July 2026): letters count as ASCII − 48.
  it('accepts the Receita Federal alphanumeric example', () => {
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj('12abc34501de35')).toBe(true);
  });

  it.each(['11.222.333/0001-80', '00000000000000', '12.ABC.345/01DE-36', '12ABC34501DE3A', '123'])('rejects %s', (v) =>
    expect(isValidCnpj(v)).toBe(false),
  );
  it('formats', () => expect(formatCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35'));
});
