import { describe, expect, it } from 'vitest';
import { BrPaymentsError, createDynamicPix, createStaticPix, crc16, isValidPix, parsePix, parsePixKey } from '../src/index.js';

// Example from the Banco Central "Manual de Padrões para Iniciação do Pix".
const BCB_EXAMPLE =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';

describe('crc16', () => {
  it('matches the CRC-16/CCITT-FALSE check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('matches the Banco Central example (6304 included in the input)', () => {
    expect(crc16(BCB_EXAMPLE.slice(0, -4))).toBe('1D3D');
  });
});

describe('createStaticPix', () => {
  it('reproduces the Banco Central example byte for byte', () => {
    expect(createStaticPix({ key: '123e4567-e12b-12d1-a456-426655440000', name: 'Fulano de Tal', city: 'BRASILIA' })).toBe(BCB_EXAMPLE);
  });

  it('encodes amount, txid, description and postal code', () => {
    const payload = createStaticPix({
      key: 'pagamentos@exemplo.com.br',
      name: 'Loja São João',
      city: 'São Paulo',
      amountCents: 123456,
      txid: 'PEDIDO123',
      description: 'Pedido 123',
      postalCode: '01310-100',
    });
    const parsed = parsePix(payload);
    expect(parsed.valid).toBe(true);
    expect(parsed).toMatchObject({
      kind: 'static',
      key: 'pagamentos@exemplo.com.br',
      keyType: 'email',
      amountCents: 123456,
      name: 'Loja Sao Joao',
      city: 'Sao Paulo',
      txid: 'PEDIDO123',
      description: 'Pedido 123',
      postalCode: '01310100',
    });
    expect(payload).toContain('54071234.56');
  });

  it('normalizes keys before encoding', () => {
    const p = parsePix(createStaticPix({ key: '+55 (11) 98765-4321', name: 'A', city: 'B' }));
    expect(p.key).toBe('+5511987654321');
    expect(parsePix(createStaticPix({ key: '529.982.247-25', name: 'A', city: 'B' })).key).toBe('52998224725');
  });

  it('truncates name and city to the spec limits and keeps output ASCII', () => {
    const payload = createStaticPix({ key: '52998224725', name: 'Ñame with a very long text beyond limits', city: 'Itapecerica da Serra' });
    const parsed = parsePix(payload);
    expect(parsed.name).toHaveLength(25);
    expect(parsed.city).toHaveLength(15);
    expect(/^[\x20-\x7E]+$/.test(payload)).toBe(true);
  });

  it('rejects invalid input with typed errors', () => {
    const base = { name: 'A', city: 'B' };
    const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as BrPaymentsError).code; } return 'none'; };
    expect(code(() => createStaticPix({ ...base, key: 'not a key' }))).toBe('INVALID_PIX_KEY');
    expect(code(() => createStaticPix({ ...base, key: '52998224725', amountCents: 10.5 }))).toBe('INVALID_AMOUNT');
    expect(code(() => createStaticPix({ ...base, key: '52998224725', amountCents: 0 }))).toBe('INVALID_AMOUNT');
    expect(code(() => createStaticPix({ ...base, key: '52998224725', amountCents: -1 }))).toBe('INVALID_AMOUNT');
    expect(code(() => createStaticPix({ ...base, key: '52998224725', txid: 'has space' }))).toBe('INVALID_FIELD');
    expect(code(() => createStaticPix({ key: '52998224725', name: '日本', city: 'B' }))).toBe('INVALID_FIELD');
  });

  it('keeps tag 26 within 99 characters when the description is long', () => {
    const p = parsePix(createStaticPix({ key: 'a'.repeat(60) + '@example.com', name: 'A', city: 'B', description: 'x'.repeat(200) }));
    expect(p.valid).toBe(true);
    expect(p.fields.find((f) => f.id === '26')!.value.length).toBeLessThanOrEqual(99);
  });
});

describe('createDynamicPix', () => {
  it('stores the location without the scheme and marks it single-use', () => {
    const payload = createDynamicPix({ url: 'https://pix.example.com/qr/v2/9d36b84f', name: 'Empresa', city: 'Recife', amountCents: 500 });
    const parsed = parsePix(payload);
    expect(parsed.valid).toBe(true);
    expect(parsed).toMatchObject({ kind: 'dynamic', singleUse: true, url: 'https://pix.example.com/qr/v2/9d36b84f', amountCents: 500 });
    expect(payload).toContain('2530pix.example.com/qr/v2/9d36b84f');
    expect(payload).not.toContain('https');
  });

  it('only accepts https URLs without credentials', () => {
    for (const url of ['http://pix.example.com/x', 'javascript:alert(1)', 'https://user:pass@pix.example.com/x', 'not a url']) {
      expect(() => createDynamicPix({ url, name: 'A', city: 'B' }), url).toThrow(BrPaymentsError);
    }
  });
});

describe('parsePix', () => {
  it('parses the Banco Central example', () => {
    expect(parsePix(BCB_EXAMPLE)).toMatchObject({
      valid: true,
      kind: 'static',
      key: '123e4567-e12b-12d1-a456-426655440000',
      keyType: 'evp',
      name: 'Fulano de Tal',
      city: 'BRASILIA',
      txid: '***',
    });
  });

  it('detects a tampered payload through the CRC', () => {
    const tampered = BCB_EXAMPLE.replace('Fulano de Tal', 'Golpista  Tal');
    const parsed = parsePix(tampered);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors).toContain('CRC mismatch');
  });

  it('reports structural problems instead of throwing', () => {
    expect(parsePix('').valid).toBe(false);
    expect(parsePix('0002').valid).toBe(false);
    expect(parsePix('000201269999').errors).toContain('malformed TLV structure');
    expect(parsePix('00020126580014br.gov.bcb.pix01361').valid).toBe(false);
    expect(parsePix(BCB_EXAMPLE.replace('BRASILIA', 'BRASÍLIA')).errors).toContain('payload must be printable ASCII');
    expect(parsePix('x'.repeat(10_000)).errors).toContain('payload is too long');
    expect(parsePix(42 as unknown as string).valid).toBe(false);
  });

  it('rejects duplicated tags', () => {
    const body = '000201' + '000201' + BCB_EXAMPLE.slice(6, -4);
    const payload = body + crc16(body);
    expect(parsePix(payload).errors).toContain('duplicated tag 00');
  });

  it('never throws on random input (fuzz)', () => {
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz.-*@ ';
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let n = 0; n < 3000; n++) {
      const len = Math.floor(rand() * 300);
      let s = rand() < 0.5 ? '000201' : '';
      for (let i = 0; i < len; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
      expect(() => parsePix(s)).not.toThrow();
    }
  });

  it('isValidPix mirrors parsePix', () => {
    expect(isValidPix(BCB_EXAMPLE)).toBe(true);
    expect(isValidPix(BCB_EXAMPLE.slice(0, -1) + '0')).toBe(false);
  });
});

describe('parsePixKey', () => {
  it.each([
    ['529.982.247-25', 'cpf', '52998224725'],
    ['11.222.333/0001-81', 'cnpj', '11222333000181'],
    ['Fulano@Example.COM', 'email', 'fulano@example.com'],
    ['+55 11 98765-4321', 'phone', '+5511987654321'],
    ['(11) 98765-4321', 'phone', '+5511987654321'],
    ['123E4567-E12B-12D1-A456-426655440000', 'evp', '123e4567-e12b-12d1-a456-426655440000'],
  ])('%s → %s', (input, type, value) => {
    expect(parsePixKey(input)).toEqual({ type, value });
  });

  it('never turns a mistyped CPF into a phone key', () => {
    expect(parsePixKey('529.982.247-26')).toBeNull();
    expect(parsePixKey('52998224726')).toBeNull();
  });

  it('accepts bare digits as a phone only when the type is explicit', () => {
    expect(parsePixKey('11987654321')).toBeNull(); // not a valid CPF, and not guessed as phone
    expect(parsePixKey('11987654321', { type: 'phone' })).toEqual({ type: 'phone', value: '+5511987654321' });
    expect(parsePixKey('1198765432', { type: 'phone' })).toBeNull(); // missing the leading 9
    expect(parsePixKey('x', { type: '__proto__' as never })).toBeNull();
  });

  it.each(['', '123', '529.982.247-26', '+1 555 123 4567', '+5511887654321', 'a@b', 'x'.repeat(200)])('rejects %s', (input) => {
    expect(parsePixKey(input)).toBeNull();
  });

  it('email check is linear on adversarial input (no ReDoS)', () => {
    const evil = 'a@' + 'a-'.repeat(40) + '!';
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) parsePixKey(evil);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
