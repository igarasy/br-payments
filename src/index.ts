export { BrPaymentsError, MAX_INPUT_LENGTH, type BrPaymentsErrorCode } from './core/errors.js';
export { crc16 } from './core/crc16.js';
export { mod10, mod11Arrecadacao, mod11Boleto } from './core/modulo.js';
export {
  formatCnpj,
  formatCpf,
  isValidCnpj,
  isValidCpf,
  normalizeCnpj,
  normalizeCpf,
} from './core/documents.js';

export { isValidPixKey, parsePixKey, type ParsePixKeyOptions, type PixKey, type PixKeyType } from './pix/key.js';
export {
  createDynamicPix,
  createStaticPix,
  isValidPix,
  parsePix,
  sanitizeText,
  type DynamicPixOptions,
  type ParsedPix,
  type StaticPixOptions,
} from './pix/brcode.js';

export {
  barcodeToDigitableLine,
  createBankBoleto,
  digitableLineToBarcode,
  formatDigitableLine,
  isValidBoleto,
  parseBoleto,
  type BoletoType,
  type CreateBankBoletoOptions,
  type ParseBoletoOptions,
  type ParsedBoleto,
} from './boleto/boleto.js';
export { dueDateToFactor, factorToDueDate } from './boleto/due-date.js';
export { BANK_NAMES } from './boleto/banks.js';
export type { TlvField } from './core/tlv.js';
