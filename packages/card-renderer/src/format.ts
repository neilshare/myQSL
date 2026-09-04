import type { PrintableQsoField } from "@myqsl/domain";

export function formatQsoField(qso: Record<string, unknown>, field: PrintableQsoField): string {
  const value = qso[field];
  if (value === null || value === undefined) return "";
  if (field === "freq_mhz" && typeof value === "number") return value.toFixed(3);
  return String(value);
}
