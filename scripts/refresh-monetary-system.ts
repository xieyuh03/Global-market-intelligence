import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateCountryMonetaryScore,
  type BoundaryInput,
  type CountryCode,
  type ModelWeights,
  type MonetaryDashboardSnapshot,
  type MonetarySeriesRow,
} from "../src/lib/monetary-system/model";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "public", "data", "monetary-system");
const outputPath = path.join(outputDir, "dashboard.json");
const WORLD_BANK_BASE = "https://api.worldbank.org/v2";

const INDICATORS = {
  broadMoney: "FM.LBL.BMNY.CN",
  nominalGdp: "NY.GDP.MKTP.CN",
  realGdp: "NY.GDP.MKTP.KN",
} as const;

interface WorldBankObservation {
  date: string;
  value: number | null;
}

interface CountryConfig {
  code: CountryCode;
  worldBankCode: "USA" | "CHN";
  name: string;
  currency: string;
  weights: ModelWeights;
  boundary: BoundaryInput;
}

const FED_DOLLAR_NOTE = "https://www.federalreserve.gov/econres/notes/feds-notes/the-international-role-of-the-u-s-dollar-2025-edition-20250718.html";

const COUNTRIES: CountryConfig[] = [
  {
    code: "US",
    worldBankCode: "USA",
    name: "美国",
    currency: "美元",
    weights: { supply: 0.5, circulation: 0.2, boundary: 0.3 },
    boundary: {
      currentIndex: 67.5,
      referenceIndex: 67.5,
      currentLabel: "2024",
      referenceLabel: "约2019",
      asOf: "2024",
      estimated: true,
      source: "Federal Reserve FEDS Notes：美元国际使用指数自2010年以来处于65至70，近五年基本稳定",
      sourceUrl: FED_DOLLAR_NOTE,
    },
  },
  {
    code: "CN",
    worldBankCode: "CHN",
    name: "中国",
    currency: "人民币",
    weights: { supply: 0.7, circulation: 0.25, boundary: 0.05 },
    boundary: {
      currentIndex: 3,
      referenceIndex: 2,
      currentLabel: "2024",
      referenceLabel: "约2019",
      asOf: "2024",
      estimated: true,
      source: "Federal Reserve FEDS Notes：人民币国际使用指数升至约3，仍低于日元和英镑",
      sourceUrl: FED_DOLLAR_NOTE,
    },
  },
];

async function fetchJson(url: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as unknown;
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }
  throw new Error(`Failed to fetch ${url}: ${String(lastError)}`);
}

async function fetchSeries(country: string, indicator: string) {
  const url = `${WORLD_BANK_BASE}/country/${country}/indicator/${indicator}?format=json&per_page=100&date=2005:2025`;
  const payload = await fetchJson(url);
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) {
    throw new Error(`Unexpected World Bank response for ${country}/${indicator}`);
  }
  return (payload[1] as WorldBankObservation[])
    .filter((item) => item.value != null && Number.isFinite(Number(item.value)))
    .map((item) => ({ year: Number(item.date), value: Number(item.value) }))
    .sort((a, b) => a.year - b.year);
}

async function buildRows(country: CountryConfig): Promise<MonetarySeriesRow[]> {
  const [broadMoney, nominalGdp, realGdp] = await Promise.all([
    fetchSeries(country.worldBankCode, INDICATORS.broadMoney),
    fetchSeries(country.worldBankCode, INDICATORS.nominalGdp),
    fetchSeries(country.worldBankCode, INDICATORS.realGdp),
  ]);
  const moneyByYear = new Map(broadMoney.map((item) => [item.year, item.value]));
  const nominalByYear = new Map(nominalGdp.map((item) => [item.year, item.value]));
  const realByYear = new Map(realGdp.map((item) => [item.year, item.value]));

  return [...moneyByYear.keys()]
    .filter((year) => nominalByYear.has(year) && realByYear.has(year))
    .sort((a, b) => a - b)
    .map((year) => ({
      year,
      broadMoney: moneyByYear.get(year)!,
      nominalGdp: nominalByYear.get(year)!,
      realGdp: realByYear.get(year)!,
    }));
}

async function main() {
  const countries = await Promise.all(COUNTRIES.map(async (country) => (
    calculateCountryMonetaryScore({
      code: country.code,
      name: country.name,
      currency: country.currency,
      weights: country.weights,
      boundary: country.boundary,
      rows: await buildRows(country),
    })
  )));

  const snapshot: MonetaryDashboardSnapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    methodology: {
      version: "1.0.0",
      scoreRange: "-100（货币不足）至 +100（货币过量）",
      matchFormula: "100 - |货币承载偏差指数|",
      supplyFormula: "20%×1年偏差 + 50%×3年偏差 + 30%×5年偏差；每1个百分点记10分",
      circulationFormula: "当期价格GDP÷广义货币，相对过去10年中间水平；偏离30%记100分",
      boundaryFormula: "约五年前国际使用指数 - 当前指数；每1点记10分",
      resultMetricsInScore: false,
    },
    countries,
    sources: [
      {
        name: "Broad money (current LCU)",
        organization: "World Bank",
        url: "https://data.worldbank.org/indicator/FM.LBL.BMNY.CN",
        note: "作为中美广义货币的统一近似口径。",
      },
      {
        name: "GDP (current and constant LCU)",
        organization: "World Bank",
        url: "https://data.worldbank.org/indicator/NY.GDP.MKTP.CN",
        note: "实际GDP用于生产增长，当期价格GDP用于计算每单位货币支撑的年产出。",
      },
      {
        name: "The International Role of the U.S. Dollar – 2025 Edition",
        organization: "Federal Reserve Board",
        url: FED_DOLLAR_NOTE,
        note: "提供美元和人民币国际使用综合指数；历史参考值由报告图表近似读取。",
      },
    ],
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${path.relative(projectRoot, outputPath)}: ${countries.map((item) => `${item.code} ${item.score > 0 ? "+" : ""}${item.score}`).join(", ")}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
