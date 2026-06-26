// src/utils/calculations.ts

export function calcFDMaturity(principal: number, ratePercent: number, years: number): number {
  // Quarterly compounding
  return principal * Math.pow(1 + ratePercent / 400, 4 * years);
}

export function calcRDMaturity(monthly: number, ratePercent: number, months: number): number {
  const r = ratePercent / 400; // quarterly rate
  return monthly * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
}

export function calcLoanRemainingMonths(endDate: string): number {
  return Math.max(0, Math.ceil(
    (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44)
  ));
}

export function calcLoanProgress(start: string, end: string): number {
  const total = new Date(end).getTime() - new Date(start).getTime();
  const elapsed = Date.now() - new Date(start).getTime();
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

export function calcDaysRemaining(dateStr: string): number {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr); target.setHours(0,0,0,0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

/**
 * Validates that a string is a valid YYYY-MM-DD calendar date.
 * Returns true if valid, false if empty or malformed.
 */
export function isValidDate(dateStr: string): boolean {
  if (!dateStr) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

