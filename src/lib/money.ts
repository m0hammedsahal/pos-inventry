/**
 * Decimal-safe money helpers. All amounts are handled as rupees but every
 * arithmetic step goes through integer paise to avoid float drift.
 */

export const toPaise = (rupees: number): number => Math.round((Number(rupees) || 0) * 100);
export const toRupees = (paise: number): number => Math.round(paise) / 100;

/** Round a rupee amount to 2 decimals safely. */
export const money = (value: number): number => toRupees(toPaise(value));

export const addMoney = (...values: number[]): number =>
  toRupees(values.reduce((sum, v) => sum + toPaise(v), 0));

export const subMoney = (a: number, b: number): number => toRupees(toPaise(a) - toPaise(b));

/** Multiply a money amount by a plain quantity/rate. */
export const mulMoney = (amount: number, factor: number): number =>
  toRupees(Math.round(toPaise(amount) * (Number(factor) || 0)));

/** Percentage of a money amount. */
export const percentOf = (amount: number, percent: number): number =>
  toRupees(Math.round((toPaise(amount) * (Number(percent) || 0)) / 100));

/** Split into round-off + rounded grand total (nearest rupee). */
export const roundOffTotal = (amount: number): { total: number; roundOff: number } => {
  const paise = toPaise(amount);
  const rounded = Math.round(paise / 100) * 100;
  return { total: toRupees(rounded), roundOff: toRupees(rounded - paise) };
};

export const clampMin = (value: number, min = 0): number => (value < min ? min : value);
