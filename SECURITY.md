# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private
[security advisory form](https://github.com/igarasy/br-payments/security/advisories/new)
or email igarasshi.lucass@gmail.com. You'll get an answer within 72 hours.

## Scope and threat model

This library parses untrusted input (scanned QR codes, pasted boletos) and
builds payment payloads. It is designed so that:

- Every input is length-bounded before any work happens (`MAX_INPUT_LENGTH`).
- Regular expressions are anchored and free of ambiguous nested quantifiers (no ReDoS).
- The TLV parser validates every length against the input and returns arrays,
  never objects keyed by attacker-controlled tags (no prototype pollution).
- Generated payloads are printable ASCII; control and bidirectional characters
  (e.g. U+202E) are stripped from names, cities and descriptions.
- Money is handled as integer centavos only.
- Pix key detection never guesses between CPF and phone, so a typo can't
  redirect a payment to another person's key.
- There are no runtime dependencies.

Out of scope — responsibilities of the application:

- **Authenticity.** The BR Code CRC detects corruption, not tampering. Show the
  receiver name, key and amount before confirming, and validate the PSP JWS of
  dynamic codes.
- **Output encoding.** Values returned by the parsers are untrusted strings;
  escape them before rendering.
