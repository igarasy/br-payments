# @igarasy/br-payments

Zero-dependency TypeScript toolkit for Brazilian payments.

- **Pix BR Code**: generate static and dynamic "copia e cola" payloads, parse and validate scanned codes (CRC16 included)
- **Pix keys**: detect and normalize CPF, CNPJ, email, phone and random (EVP) keys
- **Boletos**: bank (47 digits) and collection/arrecadação (48 digits) lines and 44-digit barcodes, check digits, amount, bank, and due date with the **2025 factor reset** handled
- **CPF and CNPJ**, including the **alphanumeric CNPJ** (Receita Federal, from July 2026)

Works in Node 18+, browsers, Deno, Bun and edge runtimes. ESM and CommonJS, fully typed, no runtime dependencies.

```bash
npm install @igarasy/br-payments
```

> Leia em português [mais abaixo](#português).

## Pix

```ts
import { createStaticPix, createDynamicPix, parsePix } from '@igarasy/br-payments';

const payload = createStaticPix({
  key: 'pagamentos@loja.com.br',   // CPF, CNPJ, email, +55 phone or EVP
  name: 'Loja São João',           // accents removed, max 25 chars
  city: 'São Paulo',               // max 15 chars
  amountCents: 4990,               // optional, integer centavos
  txid: 'PEDIDO123',               // optional, up to 25 letters/digits
  description: 'Pedido 123',       // optional
});
// → "00020126…6304XXXX" — render it as a QR code with any QR library

createDynamicPix({ url: 'https://psp.example.com/qr/v2/abc', name: 'Loja', city: 'Recife' });

const scanned = parsePix(payload);
scanned.valid;        // true when structure and CRC are correct
scanned.errors;       // human-readable reasons when it isn't
scanned.key;          // 'pagamentos@loja.com.br'
scanned.amountCents;  // 4990
```

`parsePix` never throws for malformed input: check `valid` and `errors`.

### Pix keys

```ts
import { parsePixKey } from '@igarasy/br-payments';

parsePixKey('529.982.247-25');      // { type: 'cpf', value: '52998224725' }
parsePixKey('+55 11 98765-4321');   // { type: 'phone', value: '+5511987654321' }
parsePixKey('(11) 98765-4321');     // phone mask → phone
parsePixKey('11987654321');         // null: 11 bare digits are only ever read as a CPF
parsePixKey('11987654321', { type: 'phone' }); // explicit type → phone
```

Auto-detection never guesses between a CPF and a phone number, so a mistyped CPF can't silently turn into somebody else's phone key. If your UI asks for the key type, pass `{ type }`.

## Boletos

```ts
import { parseBoleto, isValidBoleto, formatDigitableLine } from '@igarasy/br-payments';

const b = parseBoleto('10492.00650 61000.100042 00997.263900 9 89810000021403');
b.valid;         // true
b.type;          // 'bancario' | 'arrecadacao'
b.amountCents;   // 21403
b.dueDate;       // '2022-05-10'  (YYYY-MM-DD, null when there is none)
b.bankName;      // 'Caixa Econômica Federal'
b.barcode;       // 44 digits
b.digitableLine; // 47 or 48 digits

isValidBoleto('8386 0000 0050 …');   // collection boletos too
```

**Due-date factor:** the Febraban factor reached 9999 on 2025-02-21 and restarted at 1000 on 2025-02-22, so the same factor maps to dates 9000 days apart. `parseBoleto` picks the date closest to `referenceDate` (default: today, UTC). Pass `{ referenceDate }` when parsing historical boletos.

## CPF and CNPJ

```ts
import { isValidCpf, isValidCnpj, formatCnpj } from '@igarasy/br-payments';

isValidCpf('529.982.247-25');      // true
isValidCnpj('11.222.333/0001-81'); // true
isValidCnpj('12.ABC.345/01DE-35'); // true (alphanumeric)
formatCnpj('12abc34501de35');      // '12.ABC.345/01DE-35'
```

## Security notes

- **A valid CRC is not a signature.** It only detects typos and corruption. Anyone can build a valid BR Code with any name and key. Always show the receiver name, key and amount to the user before confirming a payment, and for dynamic codes fetch the URL and validate the PSP's JWS.
- **Parsed values are untrusted input.** Escape `name`, `city`, `description` and friends before rendering them as HTML.
- Inputs are bounded (`MAX_INPUT_LENGTH`), regular expressions are linear, the TLV parser never reads past the input, and generated payloads are ASCII-only.
- Money is always integer centavos. Floats are rejected.

See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

## API

| Function | Description |
|---|---|
| `createStaticPix(opts)` | Static BR Code payload |
| `createDynamicPix(opts)` | Dynamic BR Code payload (https location) |
| `parsePix(payload)` / `isValidPix(payload)` | Parse and validate a BR Code |
| `parsePixKey(key, { type? })` / `isValidPixKey` | Detect and normalize a Pix key |
| `parseBoleto(code, { referenceDate? })` / `isValidBoleto` | Parse a digitable line or barcode |
| `digitableLineToBarcode` / `barcodeToDigitableLine` | Convert between formats |
| `formatDigitableLine(code)` | Human-friendly spacing |
| `createBankBoleto(opts)` | Build a bank boleto (tests, mocks) |
| `dueDateToFactor` / `factorToDueDate` | Febraban due-date factor |
| `isValidCpf` / `isValidCnpj` / `formatCpf` / `formatCnpj` | Documents |
| `crc16`, `mod10`, `mod11Boleto`, `mod11Arrecadacao` | Low-level check digits |

Errors thrown by builders are `BrPaymentsError` with a stable `code` (`INVALID_PIX_KEY`, `INVALID_AMOUNT`, `INVALID_FIELD`, `INVALID_URL`, `INVALID_DATE`, `INPUT_TOO_LONG`, …).

## Português

Biblioteca TypeScript sem dependências para pagamentos brasileiros: gera e valida **Pix copia e cola** (estático e dinâmico), normaliza **chaves Pix**, lê **boletos** bancários e de arrecadação (linha digitável e código de barras, com a virada do fator de vencimento de 2025) e valida **CPF e CNPJ**, inclusive o **CNPJ alfanumérico**.

- Valores sempre em **centavos inteiros**.
- O CRC do Pix **não autentica** o código: mostre nome, chave e valor ao usuário antes de pagar.
- A detecção de chave **nunca confunde CPF com telefone**: um CPF digitado errado não vira a chave de outra pessoa.
- Testado contra o exemplo oficial do Banco Central e contra boletos reais.

## License

MIT © [Lucas Igarashi](https://igarasy.dev)
