// Check-digit algorithms shared by boletos and Brazilian documents.

/**
 * Febraban "módulo 10": weights 2,1,2,1… from right to left, products above 9
 * have their digits summed. Returns 0–9.
 */
export function mod10(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    let product = (digits.charCodeAt(i) - 48) * weight;
    if (product > 9) product -= 9; // same as summing both digits
    sum += product;
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

/** Weighted sum with weights 2..maxWeight cycling from the rightmost digit. */
function weightedSum(digits: string, maxWeight = 9): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += (digits.charCodeAt(i) - 48) * weight;
    weight = weight === maxWeight ? 2 : weight + 1;
  }
  return sum;
}

/** Módulo 11 for the general check digit of a bank boleto barcode: 0, 10 and 11 become 1. */
export function mod11Boleto(digits: string): number {
  const dv = 11 - (weightedSum(digits) % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

/** Módulo 11 for collection (arrecadação) barcodes: remainders 0 and 1 give 0. */
export function mod11Arrecadacao(digits: string): number {
  const rest = weightedSum(digits) % 11;
  return rest <= 1 ? 0 : 11 - rest;
}

export const onlyDigits = (value: string): string => value.replace(/\D+/g, '');
