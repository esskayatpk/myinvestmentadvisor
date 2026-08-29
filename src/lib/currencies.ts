/** Supported display currencies with their symbols. */
export const CURRENCIES: Record<string, { symbol: string; name: string; decimals?: number }> = {
  USD: { symbol: '$',   name: 'US Dollar' },
  EUR: { symbol: '€',   name: 'Euro' },
  GBP: { symbol: '£',   name: 'British Pound' },
  AUD: { symbol: 'A$',  name: 'Australian Dollar' },
  CAD: { symbol: 'C$',  name: 'Canadian Dollar' },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar' },
  CHF: { symbol: 'Fr',  name: 'Swiss Franc' },
  JPY: { symbol: '¥',   name: 'Japanese Yen', decimals: 0 },
  SGD: { symbol: 'S$',  name: 'Singapore Dollar' },
  INR: { symbol: '₹',   name: 'Indian Rupee', decimals: 0 },
  MXN: { symbol: 'MX$', name: 'Mexican Peso' },
  BRL: { symbol: 'R$',  name: 'Brazilian Real' },
};

export type CurrencyCode = keyof typeof CURRENCIES;
