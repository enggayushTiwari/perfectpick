export function formatCurrencyCr(value: number) {
  return `Rs ${value.toLocaleString("en-IN")} Cr`;
}

export function formatPct(value: number, fractionDigits = 1) {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatSignedPct(value: number, fractionDigits = 2) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(fractionDigits)}%`;
}

