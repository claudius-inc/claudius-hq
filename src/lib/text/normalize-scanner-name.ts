import { titleCaseCompanyName } from "./title-case-company";
import { SCANNER_NAME_OVERRIDES } from "./scanner-name-overrides";

export function normalizeScannerName(ticker: string, raw: string): string {
  const override = SCANNER_NAME_OVERRIDES[ticker];
  if (override) return override;

  const titled = titleCaseCompanyName(raw);

  // Preserve the ticker symbol's original case if it happens to appear in the
  // name. titleCaseCompanyName lowercases unknown all-caps tokens (so "AAPL"
  // becomes "Aapl"); when the token IS the ticker, we'd rather keep it intact.
  // Without this, e.g. "Name of AAPL" → "Name of Aapl".
  if (!ticker) return titled;
  const escaped = ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return titled.replace(new RegExp(`\\b${escaped}\\b`, "gi"), ticker);
}
