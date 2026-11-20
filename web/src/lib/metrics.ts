// SRS §13 formulas. Pure functions; return null when the denominator is 0 (shown as "—").
const div = (a: number, b: number) => (b ? a / b : null);

export const cpl = (spend: number, leads: number) => div(spend, leads);
export const conversionRate = (converted: number, total: number) => (total ? (converted / total) * 100 : null);
export const cac = (acquisitionCost: number, newCustomers: number) => div(acquisitionCost, newCustomers);
export const roas = (revenue: number, adSpend: number) => div(revenue, adSpend);
/** ROI uses gross profit, NOT revenue (SRS §13): (GP − spend) ÷ spend × 100 */
export const roi = (grossProfit: number, spend: number) => (spend ? ((grossProfit - spend) / spend) * 100 : null);

export type Kpis = { spend: number; leads: number; converted: number; customers: number; revenue: number; grossProfit: number };

export function kpis(k: Kpis) {
  return {
    cpl: cpl(k.spend, k.leads),
    conversionRate: conversionRate(k.converted, k.leads),
    cac: cac(k.spend, k.customers),
    roas: roas(k.revenue, k.spend),
    roi: roi(k.grossProfit, k.spend),
  };
}

export const inr = (n: number | null | undefined) =>
  n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const pct = (n: number | null) => (n == null ? "—" : n.toFixed(1) + "%");
export const ratio = (n: number | null) => (n == null ? "—" : n.toFixed(2) + "x");
