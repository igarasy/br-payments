/** Error thrown for invalid input. `code` is stable and safe to branch on. */
export class BrPaymentsError extends Error {
  readonly code: BrPaymentsErrorCode;

  constructor(code: BrPaymentsErrorCode, message: string) {
    super(message);
    this.name = 'BrPaymentsError';
    this.code = code;
  }
}

export type BrPaymentsErrorCode =
  | 'INPUT_TOO_LONG'
  | 'INVALID_INPUT'
  | 'INVALID_PIX_KEY'
  | 'INVALID_AMOUNT'
  | 'INVALID_FIELD'
  | 'INVALID_URL'
  | 'INVALID_DATE'
  | 'FIELD_TOO_LONG';

/**
 * Upper bound for any string this library will look at. Pix payloads are
 * capped at a few hundred characters and boletos at 48 digits; anything far
 * larger is rejected before parsing so untrusted input can't cost CPU/memory.
 */
export const MAX_INPUT_LENGTH = 1024;

export function assertString(value: unknown, what: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new BrPaymentsError('INVALID_INPUT', `${what} must be a string`);
  }
  if (value.length > MAX_INPUT_LENGTH) {
    throw new BrPaymentsError('INPUT_TOO_LONG', `${what} exceeds ${MAX_INPUT_LENGTH} characters`);
  }
}
