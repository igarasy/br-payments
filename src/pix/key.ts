import { isValidCnpj, isValidCpf, normalizeCnpj } from '../core/documents.js';

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp';

export interface PixKey {
  readonly type: PixKeyType;
  /** The key in the canonical DICT format (what goes inside the BR Code). */
  readonly value: string;
}

export interface ParsePixKeyOptions {
  /** Validate as this type only. Recommended when your UI asks for the key type. */
  type?: PixKeyType;
}

// DICT formats: phone +55DDDNUMBER, email lowercase (max 77), EVP = UUID.
// All patterns are anchored and linear (no nested ambiguous quantifiers) to avoid ReDoS.
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const EVP_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Pix phone keys are Brazilian mobile numbers: +55, 2-digit area code, 9 + 8 digits.
const BR_PHONE_RE = /^\+55[1-9][1-9]9\d{8}$/;
// A local phone written with a phone-style mask: "(11) 98765-4321", "11 98765 4321".
const PHONE_MASK_RE = /^\(?\d{2}\)?[ ]\d{4,5}[ -]?\d{4}$|^\(\d{2}\)\d{4,5}-?\d{4}$/;

const asEmail = (raw: string): PixKey | null => {
  const email = raw.toLowerCase();
  return email.length <= 77 && EMAIL_RE.test(email) ? { type: 'email', value: email } : null;
};
const asEvp = (raw: string): PixKey | null => {
  const evp = raw.toLowerCase();
  return EVP_RE.test(evp) ? { type: 'evp', value: evp } : null;
};
const asPhone = (raw: string): PixKey | null => {
  const digits = raw.replace(/[\s().\-]/g, '');
  const phone = digits.startsWith('+') ? digits : '+55' + digits;
  return BR_PHONE_RE.test(phone) ? { type: 'phone', value: phone } : null;
};
const asCpf = (raw: string): PixKey | null => {
  const cpf = raw.replace(/[\s.\-]/g, '');
  return isValidCpf(cpf) ? { type: 'cpf', value: cpf } : null;
};
const asCnpj = (raw: string): PixKey | null => {
  const cnpj = normalizeCnpj(raw);
  return isValidCnpj(cnpj) ? { type: 'cnpj', value: cnpj } : null;
};

const BY_TYPE: Record<PixKeyType, (raw: string) => PixKey | null> = {
  email: asEmail,
  evp: asEvp,
  phone: asPhone,
  cpf: asCpf,
  cnpj: asCnpj,
};

/**
 * Detects and normalizes a Pix key. Returns null when the input is not a
 * valid key.
 *
 * Auto-detection never guesses between a CPF and a phone: 11 bare digits (or
 * a CPF mask) are only accepted as a CPF, so a mistyped CPF can't silently
 * become someone's phone key. Phones need "+55" or a phone-style mask, or
 * pass `{ type: 'phone' }`.
 */
export function parsePixKey(input: string, opts: ParsePixKeyOptions = {}): PixKey | null {
  if (typeof input !== 'string' || input.length > 100) return null;
  const raw = input.trim();
  if (raw === '') return null;

  if (opts.type) {
    const parse = Object.prototype.hasOwnProperty.call(BY_TYPE, opts.type) ? BY_TYPE[opts.type] : undefined;
    return parse ? parse(raw) : null;
  }

  if (raw.includes('@')) return asEmail(raw);
  if (raw.length === 36) return asEvp(raw);
  if (raw.startsWith('+')) return asPhone(raw);
  if (PHONE_MASK_RE.test(raw)) return asPhone(raw);
  if (/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(raw)) return asCpf(raw);
  return asCnpj(raw);
}

export const isValidPixKey = (input: string, opts?: ParsePixKeyOptions): boolean => parsePixKey(input, opts) !== null;
