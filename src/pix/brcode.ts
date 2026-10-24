import { crc16 } from '../core/crc16.js';
import { BrPaymentsError, assertString } from '../core/errors.js';
import { findField, parseTlv, tlv, type TlvField } from '../core/tlv.js';
import { parsePixKey, type PixKeyType } from './key.js';

// Pix BR Code, per the Banco Central "Manual de Padrões para Iniciação do Pix"
// (EMV QRCPS-MPM). Tags used:
//   00 payload format "01"        01 point of initiation (12 = single use)
//   26 merchant account (00 GUI, 01 key, 02 description, 25 dynamic URL)
//   52 MCC "0000"   53 currency "986"   54 amount   58 "BR"
//   59 name (≤25)   60 city (≤15)       61 postal code
//   62 additional data (05 txid)        63 CRC16

const GUI = 'br.gov.bcb.pix';
const MAX_AMOUNT_CENTS = 9_999_999_999_99; // 13 chars: "9999999999.99"

interface CommonOptions {
  /** Receiver name. Accents are removed; truncated to 25 characters. */
  name: string;
  /** Receiver city. Accents are removed; truncated to 15 characters. */
  city: string;
  /** Amount in centavos (integer). Omit to let the payer type it. */
  amountCents?: number;
  /** CEP, 8 digits. */
  postalCode?: string;
}

export interface StaticPixOptions extends CommonOptions {
  /** Pix key: CPF, CNPJ, email, phone or random (EVP) key. */
  key: string;
  /** Up to 25 letters/digits. Defaults to "***" (no identifier). */
  txid?: string;
  /** Free text shown to the payer. Accents removed. */
  description?: string;
  /** Mark as single-use (tag 01 = 12). Static codes are reusable by default. */
  singleUse?: boolean;
}

export interface DynamicPixOptions extends CommonOptions {
  /**
   * The PSP location URL (https). The scheme is dropped in the payload, as the
   * spec requires; the payer's app fetches it and must verify the JWS.
   */
  url: string;
  /** Dynamic codes are single-use unless stated otherwise. */
  singleUse?: boolean;
}

/** Removes accents and anything outside printable ASCII. */
export function sanitizeText(value: string, maxLength: number): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function formatAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_AMOUNT_CENTS) {
    throw new BrPaymentsError('INVALID_AMOUNT', 'amountCents must be a positive integer of at most 13 characters as reais');
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function requiredText(value: unknown, field: string, max: number): string {
  assertString(value, field);
  const text = sanitizeText(value, max);
  if (text === '') throw new BrPaymentsError('INVALID_FIELD', `${field} is empty after removing unsupported characters`);
  return text;
}

function buildPayload(merchantAccount: string, opts: CommonOptions & { txid: string; singleUse: boolean }): string {
  const name = requiredText(opts.name, 'name', 25);
  const city = requiredText(opts.city, 'city', 15);

  let payload = tlv('00', '01');
  if (opts.singleUse) payload += tlv('01', '12');
  payload += tlv('26', merchantAccount);
  payload += tlv('52', '0000') + tlv('53', '986');
  if (opts.amountCents !== undefined) payload += tlv('54', formatAmount(opts.amountCents));
  payload += tlv('58', 'BR') + tlv('59', name) + tlv('60', city);
  if (opts.postalCode !== undefined) {
    const cep = String(opts.postalCode).replace(/\D/g, '');
    if (cep.length !== 8) throw new BrPaymentsError('INVALID_FIELD', 'postalCode must have 8 digits');
    payload += tlv('61', cep);
  }
  payload += tlv('62', tlv('05', opts.txid));
  payload += '6304';
  return payload + crc16(payload);
}

/** Builds a static Pix "copia e cola" payload (the text encoded in the QR code). */
export function createStaticPix(opts: StaticPixOptions): string {
  const key = parsePixKey(opts.key);
  if (!key) throw new BrPaymentsError('INVALID_PIX_KEY', 'key is not a valid Pix key');

  const txid = opts.txid ?? '***';
  if (txid !== '***' && !/^[A-Za-z0-9]{1,25}$/.test(txid)) {
    throw new BrPaymentsError('INVALID_FIELD', 'txid must be 1–25 letters or digits');
  }

  let account = tlv('00', GUI) + tlv('01', key.value);
  if (opts.description !== undefined) {
    assertString(opts.description, 'description');
    // GUI + key + description must fit in tag 26 (99 chars).
    const room = 99 - account.length - 4;
    const description = sanitizeText(opts.description, Math.max(0, room));
    if (description) account += tlv('02', description);
  }

  return buildPayload(account, { ...opts, txid, singleUse: opts.singleUse ?? false });
}

/** Builds a dynamic Pix payload pointing to a PSP location URL. */
export function createDynamicPix(opts: DynamicPixOptions): string {
  assertString(opts.url, 'url');
  let url: URL;
  try {
    url = new URL(opts.url);
  } catch {
    throw new BrPaymentsError('INVALID_URL', 'url is not a valid URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new BrPaymentsError('INVALID_URL', 'url must be https without credentials');
  }
  const location = (url.host + url.pathname + url.search).replace(/\/$/, '');
  if (!/^[\x21-\x7E]+$/.test(location)) throw new BrPaymentsError('INVALID_URL', 'url must be ASCII');

  const account = tlv('00', GUI) + tlv('25', location);
  return buildPayload(account, { ...opts, txid: '***', singleUse: opts.singleUse ?? true });
}

export interface ParsedPix {
  /** True when the structure is well formed and the CRC matches. */
  readonly valid: boolean;
  /** Human-readable reasons when `valid` is false. */
  readonly errors: readonly string[];
  readonly kind: 'static' | 'dynamic' | 'unknown';
  readonly singleUse: boolean;
  readonly key?: string;
  readonly keyType?: PixKeyType;
  /** Dynamic location, with https:// restored. */
  readonly url?: string;
  readonly amountCents?: number;
  readonly name?: string;
  readonly city?: string;
  readonly postalCode?: string;
  readonly txid?: string;
  readonly description?: string;
  readonly crc: { readonly expected: string; readonly actual: string } | null;
  /** All top-level fields, in order. */
  readonly fields: readonly TlvField[];
}

const AMOUNT_RE = /^\d{1,10}(?:\.\d{1,2})?$/;

/**
 * Parses and validates a Pix payload (e.g. scanned from a QR code).
 *
 * Never throws for malformed payloads; check `valid` and `errors`. A valid CRC
 * only proves the text was not corrupted: it is not a signature. Always show
 * the receiver name, key and amount to the user before paying, and for
 * dynamic codes fetch the URL and validate the PSP's JWS.
 */
export function parsePix(payload: string): ParsedPix {
  const errors: string[] = [];
  const empty: ParsedPix = { valid: false, errors, kind: 'unknown', singleUse: false, crc: null, fields: [] };
  if (typeof payload !== 'string') return { ...empty, errors: ['payload must be a string'] };
  if (payload.length > 512) return { ...empty, errors: ['payload is too long'] };

  const text = payload.trim();
  if (!/^[\x20-\x7E]+$/.test(text)) return { ...empty, errors: ['payload must be printable ASCII'] };

  const fields = parseTlv(text);
  if (!fields || fields.length === 0) return { ...empty, errors: ['malformed TLV structure'] };

  const last = fields[fields.length - 1]!;
  let crc: ParsedPix['crc'] = null;
  if (last.id !== '63' || last.value.length !== 4) {
    errors.push('CRC (tag 63) must be the last field');
  } else {
    crc = { expected: last.value.toUpperCase(), actual: crc16(text.slice(0, -4)) };
    if (crc.expected !== crc.actual) errors.push('CRC mismatch');
  }
  if (fields[0]?.id !== '00' || fields[0].value !== '01') errors.push('payload format indicator (tag 00) must be "01" and come first');
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.id)) errors.push(`duplicated tag ${f.id}`);
    seen.add(f.id);
  }
  if (findField(fields, '53') !== '986') errors.push('currency (tag 53) must be 986 (BRL)');
  if (findField(fields, '58') !== 'BR') errors.push('country (tag 58) must be BR');

  const account = fields.find((f) => f.id === '26' || (Number(f.id) >= 26 && Number(f.id) <= 51 && /^0014br\.gov\.bcb\.pix/i.test(f.value)));
  const sub = account ? parseTlv(account.value) : null;
  if (!sub) errors.push('merchant account (tag 26) is missing or malformed');
  else if (findField(sub, '00')?.toLowerCase() !== GUI) errors.push('merchant account GUI must be br.gov.bcb.pix');

  const keyRaw = sub ? findField(sub, '01') : undefined;
  const location = sub ? findField(sub, '25') : undefined;
  const parsedKey = keyRaw !== undefined ? parsePixKey(keyRaw) : null;
  if (keyRaw !== undefined && !parsedKey) errors.push('Pix key is not valid');
  if (sub && keyRaw === undefined && location === undefined) errors.push('merchant account has neither a key nor a URL');

  let amountCents: number | undefined;
  const amount = findField(fields, '54');
  if (amount !== undefined) {
    if (!AMOUNT_RE.test(amount)) errors.push('amount (tag 54) is malformed');
    else {
      const [reais = '0', cents = ''] = amount.split('.');
      amountCents = Number(reais) * 100 + Number(cents.padEnd(2, '0'));
    }
  }

  const additional = findField(fields, '62');
  const additionalFields = additional !== undefined ? parseTlv(additional) : null;
  if (additional !== undefined && !additionalFields) errors.push('additional data (tag 62) is malformed');

  const name = findField(fields, '59');
  const city = findField(fields, '60');
  if (!name) errors.push('merchant name (tag 59) is missing');
  if (!city) errors.push('merchant city (tag 60) is missing');

  const result: Record<string, unknown> = {
    valid: errors.length === 0,
    errors,
    kind: location !== undefined ? 'dynamic' : keyRaw !== undefined ? 'static' : 'unknown',
    singleUse: findField(fields, '01') === '12',
    crc,
    fields,
  };
  const set = (k: string, v: unknown) => { if (v !== undefined) result[k] = v; };
  set('key', parsedKey?.value ?? keyRaw);
  set('keyType', parsedKey?.type);
  set('url', location !== undefined ? `https://${location}` : undefined);
  set('amountCents', amountCents);
  set('name', name);
  set('city', city);
  set('postalCode', findField(fields, '61'));
  set('txid', additionalFields ? findField(additionalFields, '05') : undefined);
  set('description', sub ? findField(sub, '02') : undefined);
  return result as unknown as ParsedPix;
}

export const isValidPix = (payload: string): boolean => parsePix(payload).valid;
