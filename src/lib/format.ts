/**
 * Format a numeric amount with an optional unit symbol.
 *
 * @param amount     - The number to format
 * @param symbol     - Unit symbol (e.g. "¥", "個")
 * @param position   - Where to place the symbol relative to the number
 * @param zeroText   - Text to display when amount is 0 (default: "-")
 */
export function formatAmount(
  amount: number,
  symbol = "",
  position: string = "left",
  zeroText = "-",
): string {
  if (amount === 0) return zeroText;
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("ja-JP");
  const sep = symbol ? " " : "";
  const value =
    position === "right"
      ? `${formatted}${sep}${symbol}`
      : `${symbol}${sep}${formatted}`;
  return amount < 0 ? `△${value}` : value;
}

/**
 * Format a unit preview string (e.g. "100 個" or "¥ 100").
 */
export function formatUnitPreview(
  symbol: string,
  position: string = "left",
  sample = 100,
): string {
  if (!symbol) return String(sample);
  return position === "right"
    ? `${sample} ${symbol}`
    : `${symbol} ${sample}`;
}
