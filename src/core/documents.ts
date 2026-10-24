import { assertString } from './errors.js';

// CPF and CNPJ check digits. CNPJ supports the alphanumeric format introduced
// by Receita Federal (IN RFB 2.229/2024): the first 12 characters may be A–Z or
// 0–9, each worth (ASCII code − 48), and the 2 check digits stay numeric.

const CPF_RE = /^\d{11}$/;
const CNPJ_RE = /^[0-9A-Z]{12}\d{2}$/;

/** Strips punctuation and uppercases. Does not validate. */
export function normalizeCpf(value: string): string {
  assertString(value, 'CPF');
  return value.replace(/[\s.\-]/g, '');
}

export function normalizeCnpj(value: string): string {
  assertString(value, 'CNPJ');
  return value.replace(/[\s./\-]/g, '').toUpperCase();
}

export function isValidCpf(value: string): boolean {
  if (typeof value !== 'string' || value.length > 32) return false;
  const cpf = normalizeCpf(value);
  if (!CPF_RE.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += (cpf.charCodeAt(i) - 48) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return dv(9) === cpf.charCodeAt(9) - 48 && dv(10) === cpf.charCodeAt(10) - 48;
}

export function isValidCnpj(value: string): boolean {
  if (typeof value !== 'string' || value.length > 32) return false;
  const cnpj = normalizeCnpj(value);
  if (!CNPJ_RE.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (len: number) => {
    let sum = 0;
    let weight = 2;
    for (let i = len - 1; i >= 0; i--) {
      sum += (cnpj.charCodeAt(i) - 48) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return dv(12) === cnpj.charCodeAt(12) - 48 && dv(13) === cnpj.charCodeAt(13) - 48;
}

export function formatCpf(value: string): string {
  const cpf = normalizeCpf(value);
  return CPF_RE.test(cpf) ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : cpf;
}

export function formatCnpj(value: string): string {
  const c = normalizeCnpj(value);
  return CNPJ_RE.test(c) ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c;
}
