function na(value: number | null | undefined, available?: boolean) {
  if (available === false) return "N/A";
  if (value == null) return "N/A";
  return null;
}

export function metricOrNA(value: number | null | undefined, available: boolean | undefined, formatted: string) {
  return na(value, available) ?? formatted;
}
