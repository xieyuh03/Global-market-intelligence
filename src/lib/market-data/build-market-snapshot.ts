import {
  decomposeMarketReturns,
  type DatedFactorValue,
  type FactorSeriesInput,
} from "./factor-model";

type MarketDefinition = {
  id: string;
  countryId: string;
  name: string;
  shortName: string;
  symbol: string;
  exchange: string;
  coordinates: [number, number];
  region: string;
};

type FactorDefinition = Omit<FactorSeriesInput, "values"> & {
  transform: "return" | "yield_change" | "relative_return";
  invert?: boolean;
};

type CurrencyFactorDefinition = FactorDefinition & {
  marketId: string;
};

type YahooChartResponse = {
  chart: {
    result: Array<{
      meta: {
        currency?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          close: Array<number | null>;
          volume: Array<number | null>;
        }>;
      };
    }> | null;
    error: { description?: string } | null;
  };
};

type PriceObservation = {
  date: string;
  close: number;
  volume: number;
};

type PreferencePoint = PriceObservation & {
  marketReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
  volumeRatio: number;
  contribution: number;
  cumulative: number;
};

type MarketMetrics = {
  preference5d: number;
  preference20d: number;
  preference60d: number;
  preference120d: number;
  persistence20d: number;
  acceleration: number;
  streak: number;
  relativeReturn20d: number;
  regime: "持续增配" | "增配初现" | "趋势退潮" | "持续撤离" | "撤离初现" | "震荡分化";
};

const MARKETS: MarketDefinition[] = [
  { id: "us", countryId: "840", name: "美国", shortName: "美国", symbol: "SPY", exchange: "NYSE / NASDAQ", coordinates: [-74.01, 40.71], region: "北美" },
  { id: "ca", countryId: "124", name: "加拿大", shortName: "加拿大", symbol: "EWC", exchange: "TSX", coordinates: [-79.38, 43.65], region: "北美" },
  { id: "br", countryId: "076", name: "巴西", shortName: "巴西", symbol: "EWZ", exchange: "B3", coordinates: [-46.63, -23.55], region: "拉美" },
  { id: "uk", countryId: "826", name: "英国", shortName: "英国", symbol: "EWU", exchange: "LSE", coordinates: [-0.13, 51.51], region: "欧洲" },
  { id: "eu", countryId: "276", name: "欧元区", shortName: "欧洲", symbol: "FEZ", exchange: "Euronext / Xetra", coordinates: [8.68, 50.11], region: "欧洲" },
  { id: "jp", countryId: "392", name: "日本", shortName: "日本", symbol: "EWJ", exchange: "TSE", coordinates: [139.69, 35.68], region: "亚太" },
  { id: "cn", countryId: "156", name: "中国内地", shortName: "A股", symbol: "ASHR", exchange: "SSE / SZSE", coordinates: [121.47, 31.23], region: "亚太" },
  { id: "hk", countryId: "156", name: "中国香港", shortName: "港股", symbol: "EWH", exchange: "HKEX", coordinates: [114.17, 22.32], region: "亚太" },
  { id: "in", countryId: "356", name: "印度", shortName: "印度", symbol: "INDA", exchange: "NSE / BSE", coordinates: [72.88, 19.08], region: "亚太" },
  { id: "kr", countryId: "410", name: "韩国", shortName: "韩国", symbol: "EWY", exchange: "KRX", coordinates: [126.98, 37.57], region: "亚太" },
  { id: "tw", countryId: "158", name: "中国台湾", shortName: "台湾", symbol: "EWT", exchange: "TWSE", coordinates: [121.56, 25.04], region: "亚太" },
  { id: "au", countryId: "036", name: "澳大利亚", shortName: "澳洲", symbol: "EWA", exchange: "ASX", coordinates: [151.21, -33.87], region: "亚太" },
];

const GLOBAL_EQUITY_FACTOR: FactorDefinition = {
  id: "global_equity",
  label: "全球股票",
  symbol: "ACWI",
  category: "global",
  unit: "percent",
  transform: "return",
};

const COMMON_FACTORS: FactorDefinition[] = [
  { id: "usd", label: "美元指数", symbol: "DX-Y.NYB", category: "macro", unit: "percent", transform: "return" },
  { id: "us10y", label: "美债10Y", symbol: "^TNX", category: "macro", unit: "basis_points", transform: "yield_change" },
  { id: "vix", label: "VIX", symbol: "^VIX", category: "macro", unit: "percent", transform: "return" },
  { id: "semiconductors", label: "半导体超额", symbol: "SOXX", category: "sector", unit: "percent", transform: "relative_return" },
  { id: "energy", label: "能源超额", symbol: "XLE", category: "sector", unit: "percent", transform: "relative_return" },
  { id: "financials", label: "金融超额", symbol: "XLF", category: "sector", unit: "percent", transform: "relative_return" },
  { id: "industrials", label: "工业超额", symbol: "XLI", category: "sector", unit: "percent", transform: "relative_return" },
];

const CURRENCY_FACTORS: CurrencyFactorDefinition[] = [
  { marketId: "ca", id: "local_currency", label: "加元兑美元", symbol: "CAD=X", category: "currency", unit: "percent", transform: "return", invert: true },
  { marketId: "br", id: "local_currency", label: "雷亚尔兑美元", symbol: "BRL=X", category: "currency", unit: "percent", transform: "return", invert: true },
  { marketId: "uk", id: "local_currency", label: "英镑兑美元", symbol: "GBPUSD=X", category: "currency", unit: "percent", transform: "return" },
  { marketId: "eu", id: "local_currency", label: "欧元兑美元", symbol: "EURUSD=X", category: "currency", unit: "percent", transform: "return" },
  { marketId: "jp", id: "local_currency", label: "日元兑美元", symbol: "JPY=X", category: "currency", unit: "percent", transform: "return", invert: true },
  { marketId: "cn", id: "local_currency", label: "人民币兑美元", symbol: "CNY=X", category: "currency", unit: "percent", transform: "return", invert: true },
  { marketId: "hk", id: "local_currency", label: "港元兑美元", symbol: "HKD=X", category: "currency", unit: "percent", transform: "return", invert: true },
  { marketId: "in", id: "local_currency", label: "卢比兑美元", symbol: "INR=X", category: "currency", unit: "percent", transform: "return", invert: true },
  { marketId: "kr", id: "local_currency", label: "韩元兑美元", symbol: "KRW=X", category: "currency", unit: "percent", transform: "return", invert: true },
  { marketId: "tw", id: "local_currency", label: "新台币兑美元", symbol: "TWD=X", category: "currency", unit: "percent", transform: "return", invert: true },
  { marketId: "au", id: "local_currency", label: "澳元兑美元", symbol: "AUDUSD=X", category: "currency", unit: "percent", transform: "return" },
];

const cache = new Map<string, { timestamp: number; payload: unknown }>();
const CACHE_TTL = 10 * 60 * 1000;
const BENCHMARK = { symbol: "ACWI", name: "全球股票基准" };

function percentChange(current: number, previous: number | undefined) {
  if (!previous || previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number, digits = 2) {
  return +value.toFixed(digits);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sumRecent(points: PreferencePoint[], days: number) {
  return points.slice(-days).reduce((sum, point) => sum + point.contribution, 0);
}

function streakOf(points: PreferencePoint[]) {
  const latest = points.at(-1)?.contribution ?? 0;
  if (latest === 0) return 0;
  const direction = Math.sign(latest);
  let streak = 0;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (Math.sign(points[index].contribution) !== direction) break;
    streak += direction;
  }
  return streak;
}

function classifyRegime(metrics: Omit<MarketMetrics, "regime">): MarketMetrics["regime"] {
  if (metrics.preference20d >= 2 && metrics.preference60d >= 3 && metrics.persistence20d >= 55) return "持续增配";
  if (metrics.preference5d >= 1 && metrics.acceleration >= 0.15 && metrics.preference20d < 2) return "增配初现";
  if (metrics.preference60d >= 3 && metrics.preference20d <= 0) return "趋势退潮";
  if (metrics.preference20d <= -2 && metrics.preference60d <= -3 && metrics.persistence20d <= 45) return "持续撤离";
  if (metrics.preference5d <= -1 && metrics.acceleration <= -0.15 && metrics.preference20d > -2) return "撤离初现";
  return "震荡分化";
}

async function fetchSeries(symbol: string, requireVolume = true) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 StockBase/1.0" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`${symbol}: Yahoo ${response.status}`);

  const json = (await response.json()) as YahooChartResponse;
  const result = json.chart.result?.[0];
  if (!result || json.chart.error) throw new Error(`${symbol}: no market data`);

  const quote = result.indicators.quote[0];
  const observations = result.timestamp
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      close: quote.close[index],
      volume: quote.volume[index] ?? 0,
    }))
    .filter((point): point is { date: string; close: number; volume: number } =>
      point.close != null && (!requireVolume || point.volume > 0),
    );

  if (observations.length < 120) throw new Error(`${symbol}: insufficient history`);

  return {
    currency: result.meta.currency ?? "USD",
    price: result.meta.regularMarketPrice ?? observations.at(-1)!.close,
    observations,
  };
}

function buildBenchmarkReturns(observations: PriceObservation[]) {
  const returns = new Map<string, number>();
  for (let index = 1; index < observations.length; index += 1) {
    returns.set(observations[index].date, percentChange(observations[index].close, observations[index - 1].close));
  }
  return returns;
}

function buildFactorValues(
  observations: PriceObservation[],
  definition: FactorDefinition,
  benchmarkReturns: Map<string, number>,
) {
  const values: DatedFactorValue[] = [];
  for (let index = 1; index < observations.length; index += 1) {
    const point = observations[index];
    const previous = observations[index - 1];
    let value = definition.transform === "yield_change"
      ? (point.close - previous.close) * 100
      : percentChange(point.close, previous.close);
    if (definition.transform === "relative_return") {
      const benchmarkReturn = benchmarkReturns.get(point.date);
      if (benchmarkReturn == null) continue;
      value -= benchmarkReturn;
    }
    if (definition.invert) value *= -1;
    values.push({ date: point.date, value: rounded(value, 4) });
  }
  return values;
}

async function fetchFactor(definition: FactorDefinition, benchmarkReturns: Map<string, number>): Promise<FactorSeriesInput> {
  const series = await fetchSeries(definition.symbol, false);
  return {
    id: definition.id,
    label: definition.label,
    symbol: definition.symbol,
    category: definition.category,
    unit: definition.unit,
    values: buildFactorValues(series.observations, definition, benchmarkReturns),
  };
}

function factorSnapshot(factor: FactorSeriesInput) {
  const recent = factor.values.slice(-20);
  return {
    id: factor.id,
    label: factor.label,
    symbol: factor.symbol,
    category: factor.category,
    unit: factor.unit,
    asOf: factor.values.at(-1)?.date ?? null,
    move20d: rounded(recent.reduce((sum, point) => sum + point.value, 0)),
  };
}

async function fetchMarket(definition: MarketDefinition, benchmarkReturns: Map<string, number>) {
  const series = await fetchSeries(definition.symbol);
  const observations = series.observations;
  const history: PreferencePoint[] = [];
  let cumulative = 0;

  for (let index = 20; index < observations.length; index += 1) {
    const point = observations[index];
    const marketReturn = percentChange(point.close, observations[index - 1]?.close);
    const benchmarkReturn = benchmarkReturns.get(point.date) ?? 0;
    const excessReturn = marketReturn - benchmarkReturn;
    const baselineVolume = average(observations.slice(index - 20, index).map((item) => item.volume));
    const volumeRatio = baselineVolume > 0 ? point.volume / baselineVolume : 1;
    const contribution = clamp(excessReturn * clamp(volumeRatio, 0.65, 1.75), -6, 6);
    cumulative += contribution;
    history.push({
      ...point,
      marketReturn: rounded(marketReturn),
      benchmarkReturn: rounded(benchmarkReturn),
      excessReturn: rounded(excessReturn),
      volumeRatio: rounded(volumeRatio),
      contribution: rounded(contribution, 3),
      cumulative: rounded(cumulative, 3),
    });
  }

  if (history.length < 100) throw new Error(`${definition.symbol}: insufficient aligned history`);

  const latest = observations.at(-1)!;
  const return1d = percentChange(latest.close, observations.at(-2)?.close);
  const return5d = percentChange(latest.close, observations.at(-6)?.close);
  const return20d = percentChange(latest.close, observations.at(-21)?.close);
  const recentVolume = observations.slice(-5).reduce((sum, point) => sum + point.volume, 0) / 5;
  const baselineVolume = observations.slice(-25, -5).reduce((sum, point) => sum + point.volume, 0) / 20;
  const volumeRatio = baselineVolume > 0 ? recentVolume / baselineVolume : 1;
  const last20 = history.slice(-20);
  const last5Average = average(history.slice(-5).map((point) => point.contribution));
  const prior15Average = average(history.slice(-20, -5).map((point) => point.contribution));
  const marketReturn20d = percentChange(latest.close, observations.at(-21)?.close);
  const benchmarkReturn20d = Array.from(benchmarkReturns.values()).slice(-20).reduce((sum, value) => sum + value, 0);
  const baseMetrics: Omit<MarketMetrics, "regime"> = {
    preference5d: rounded(sumRecent(history, 5)),
    preference20d: rounded(sumRecent(history, 20)),
    preference60d: rounded(sumRecent(history, 60)),
    preference120d: rounded(sumRecent(history, 120)),
    persistence20d: rounded(last20.filter((point) => point.contribution > 0).length / Math.max(1, last20.length) * 100, 0),
    acceleration: rounded(last5Average - prior15Average, 3),
    streak: streakOf(history),
    relativeReturn20d: rounded(marketReturn20d - benchmarkReturn20d),
  };
  const metrics: MarketMetrics = { ...baseMetrics, regime: classifyRegime(baseMetrics) };
  const flowScore = Math.round(clamp(metrics.preference20d * 8 + metrics.acceleration * 25, -100, 100));

  return {
    ...definition,
    currency: series.currency,
    price: series.price,
    asOf: latest.date,
    return1d: +return1d.toFixed(2),
    return5d: +return5d.toFixed(2),
    return20d: +return20d.toFixed(2),
    volumeRatio: +volumeRatio.toFixed(2),
    flowScore,
    signal: metrics.regime,
    metrics,
    history,
  };
}

export async function buildMarketSnapshot() {
  const cached = cache.get("regional-markets");
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.payload;
  }

  let benchmarkSeries: Awaited<ReturnType<typeof fetchSeries>>;
  try {
    benchmarkSeries = await fetchSeries(BENCHMARK.symbol);
  } catch (error) {
    throw new Error(`全球基准数据不可用: ${String(error)}`);
  }
  const benchmarkReturns = buildBenchmarkReturns(benchmarkSeries.observations);
  const benchmarkFactor: FactorSeriesInput = {
    id: GLOBAL_EQUITY_FACTOR.id,
    label: GLOBAL_EQUITY_FACTOR.label,
    symbol: GLOBAL_EQUITY_FACTOR.symbol,
    category: GLOBAL_EQUITY_FACTOR.category,
    unit: GLOBAL_EQUITY_FACTOR.unit,
    values: buildFactorValues(benchmarkSeries.observations, GLOBAL_EQUITY_FACTOR, benchmarkReturns),
  };
  const [settled, settledCommonFactors, settledCurrencies] = await Promise.all([
    Promise.allSettled(MARKETS.map((market) => fetchMarket(market, benchmarkReturns))),
    Promise.allSettled(COMMON_FACTORS.map((factor) => fetchFactor(factor, benchmarkReturns))),
    Promise.allSettled(CURRENCY_FACTORS.map(async (factor) => ({ marketId: factor.marketId, factor: await fetchFactor(factor, benchmarkReturns) }))),
  ]);
  const markets = settled
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchMarket>>> => result.status === "fulfilled")
    .map((result) => result.value);
  const errors = settled
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => String(result.reason));
  const commonFactors = settledCommonFactors
    .filter((result): result is PromiseFulfilledResult<FactorSeriesInput> => result.status === "fulfilled")
    .map((result) => result.value);
  const currencyFactors = new Map(settledCurrencies
    .filter((result): result is PromiseFulfilledResult<{ marketId: string; factor: FactorSeriesInput }> => result.status === "fulfilled")
    .map((result) => [result.value.marketId, result.value.factor]));
  const factorErrors = [
    ...settledCommonFactors.map((result, index) => result.status === "rejected" ? `${COMMON_FACTORS[index].symbol}: ${String(result.reason)}` : null),
    ...settledCurrencies.map((result, index) => result.status === "rejected" ? `${CURRENCY_FACTORS[index].symbol}: ${String(result.reason)}` : null),
  ].filter((error): error is string => error != null);

  if (markets.length < 6) {
    throw new Error(`可用区域行情不足: ${errors.join("; ")}`);
  }

  const strongest = [...markets].sort((a, b) => b.flowScore - a.flowScore)[0];
  const weakest = [...markets].sort((a, b) => a.flowScore - b.flowScore)[0];
  const positiveCount = markets.filter((market) => market.metrics.regime.includes("增配")).length;
  const negativeCount = markets.filter((market) => market.metrics.regime.includes("撤离")).length;
  const averageScore = Math.round(markets.reduce((sum, market) => sum + market.flowScore, 0) / markets.length);
  const regimeCounts = markets.reduce<Record<string, number>>((counts, market) => {
    counts[market.metrics.regime] = (counts[market.metrics.regime] ?? 0) + 1;
    return counts;
  }, {});
  const factorMarkets = markets.map((market) => ({
    marketId: market.id,
    marketName: market.name,
    ...decomposeMarketReturns(
      market.history.map((point) => ({ date: point.date, value: point.marketReturn })),
      [benchmarkFactor, ...commonFactors, ...(currencyFactors.get(market.id) ? [currencyFactors.get(market.id)!] : [])],
    ),
  }));
  const readyFactorMarkets = factorMarkets.filter((market) => market.status === "ready").length;

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "Yahoo Finance 区域ETF日线",
    dataClass: "proxy",
    methodology: "资金偏好累计指数以区域ETF相对ACWI的每日超额收益为基础，并按异常成交量加权。单位为代理点数，不代表基金申赎金额或真实跨境汇款。",
    benchmark: {
      ...BENCHMARK,
      asOf: benchmarkSeries.observations.at(-1)?.date,
      observations: benchmarkSeries.observations,
    },
    factorModel: {
      status: readyFactorMarkets === 0 ? "unavailable" : factorErrors.length ? "partial" : "ready",
      methodology: "以最近120个对齐交易日的日收益运行岭回归；解释变量包括ACWI、美元、10年美债收益率变化、VIX、行业相对收益和本币兑美元。20日贡献为回归系数乘同期因子变动，残差仅表示模型未解释收益，不代表独立资金流或事件因果。",
      windowDays: 120,
      readyMarkets: readyFactorMarkets,
      commonFactors: [benchmarkFactor, ...commonFactors].map(factorSnapshot),
      markets: factorMarkets,
      errors: factorErrors,
    },
    summary: { strongest, weakest, positiveCount, negativeCount, averageScore, marketCount: markets.length, regimeCounts },
    markets,
    errors,
  };

  cache.set("regional-markets", { timestamp: Date.now(), payload });
  return payload;
}
