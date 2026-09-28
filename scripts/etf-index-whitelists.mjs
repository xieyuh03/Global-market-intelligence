export const HSI_ETF_CODES = Object.freeze([
  "159271",
  "159920",
  "513210",
  "513600",
  "513660",
]);

export const HSTECH_ETF_CODES = Object.freeze([
  "158042",
  "159740",
  "159741",
  "159742",
  "513010",
  "513130",
  "513180",
  "513260",
  "513380",
  "513580",
  "513890",
  "520570",
  "520590",
  "520920",
]);

export const CSI300_ETF_CODES = Object.freeze([
  "159300",
  "159330",
  "159393",
  "159673",
  "159919",
  "159925",
  "510300",
  "510310",
  "510320",
  "510330",
  "510350",
  "510360",
  "510370",
  "510380",
  "510390",
  "515130",
  "515310",
  "515330",
  "515350",
  "515360",
  "515380",
  "515390",
  "515660",
  "561930",
  "563520",
]);

const HSI_ETF_CODE_SET = new Set(HSI_ETF_CODES);
const HSTECH_ETF_CODE_SET = new Set(HSTECH_ETF_CODES);
const CSI300_ETF_CODE_SET = new Set(CSI300_ETF_CODES);

export function classifyStrictHangSengIndexEtf(code) {
  const normalizedCode = String(code ?? "").trim();
  if (HSI_ETF_CODE_SET.has(normalizedCode)) return "hong-kong-hsi";
  if (HSTECH_ETF_CODE_SET.has(normalizedCode)) return "hong-kong-hstech";
  return null;
}

export function classifyStrictCsi300Etf(code) {
  return CSI300_ETF_CODE_SET.has(String(code ?? "").trim())
    ? "csi-300"
    : null;
}
