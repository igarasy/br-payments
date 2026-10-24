// Common bank codes (COMPE). Informational only: unknown codes are still valid.
export const BANK_NAMES: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, string>, {
    '001': 'Banco do Brasil',
    '033': 'Santander',
    '041': 'Banrisul',
    '070': 'BRB',
    '077': 'Banco Inter',
    '104': 'Caixa Econômica Federal',
    '208': 'BTG Pactual',
    '212': 'Banco Original',
    '237': 'Bradesco',
    '260': 'Nubank',
    '290': 'PagBank',
    '323': 'Mercado Pago',
    '336': 'C6 Bank',
    '341': 'Itaú Unibanco',
    '380': 'PicPay',
    '422': 'Banco Safra',
    '748': 'Sicredi',
    '756': 'Sicoob',
  }),
);
