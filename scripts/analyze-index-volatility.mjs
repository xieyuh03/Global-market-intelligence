import dns from "node:dns";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dns.setDefaultResultOrder("ipv4first");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "public/data/volatility-analysis");
const RAW_DIR = path.join(OUTPUT, "raw");
const DERIVED_DIR = path.join(OUTPUT, "derived");
const CHART_DIR = path.join(OUTPUT, "charts");
const TODAY = new Date().toISOString().slice(0, 10);
const ANNUALIZATION = Math.sqrt(252);
const COMPARABLE_START = "2005-01-04";
const RETRY_DELAYS_MS = [0, 1_500, 4_000];

const INDEXES = [
  { id: "sp500", name: "标普500", market: "美国", source: "Yahoo Finance", type: "yahoo", symbol: "^GSPC", period1: -1325583000 },
  { id: "nasdaq-composite", name: "纳斯达克综合指数", market: "美国", source: "Yahoo Finance", type: "yahoo", symbol: "^IXIC", period1: 34612200 },
  { id: "shanghai-composite", name: "上证指数", market: "中国", source: "东方财富", type: "eastmoney", secid: "1.000001" },
  { id: "csi300", name: "沪深300", market: "中国", source: "东方财富", type: "eastmoney", secid: "1.000300" },
];

function round(value, digits = 6) {
  return value == null || !Number.isFinite(value) ? null : +value.toFixed(digits);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values) {
  if (values.length < 2) return null;
  const center = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1));
}

function covariance(left, right) {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = mean(left);
  const rightMean = mean(right);
  return left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0) / (left.length - 1);
}

function correlation(left, right) {
  const cov = covariance(left, right);
  const denominator = standardDeviation(left) * standardDeviation(right);
  return cov == null || !denominator ? null : cov / denominator;
}

function quantile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower + 1] == null ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

function linearRegression(x, y) {
  const cov = covariance(x, y);
  const variance = standardDeviation(x) ** 2;
  if (cov == null || !variance) return { intercept: null, slope: null, rSquared: null };
  const slope = cov / variance;
  const intercept = mean(y) - slope * mean(x);
  const predicted = x.map((value) => intercept + slope * value);
  const residualSquares = y.reduce((sum, value, index) => sum + (value - predicted[index]) ** 2, 0);
  const center = mean(y);
  const totalSquares = y.reduce((sum, value) => sum + (value - center) ** 2, 0);
  return { intercept, slope, rSquared: totalSquares ? Math.max(0, 1 - residualSquares / totalSquares) : null };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchPayload(url, headers, parse) {
  let lastError;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (RETRY_DELAYS_MS[attempt]) await wait(RETRY_DELAYS_MS[attempt]);
    let response;
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(45_000) });
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length - 1) throw error;
      continue;
    }
    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText}: ${url}`);
      const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      if (!retryable || attempt === RETRY_DELAYS_MS.length - 1) throw error;
      lastError = error;
      continue;
    }
    try {
      return await parse(response);
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length - 1) throw error;
    }
  }
  throw lastError;
}

async function fetchJson(url, headers = {}) {
  return fetchPayload(url, headers, (response) => response.json());
}

async function fetchYahoo(definition) {
  const period2 = Math.floor(Date.now() / 1000) + 86_400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(definition.symbol)}?period1=${definition.period1}&period2=${period2}&interval=1d&events=history`;
  const payload = await fetchJson(url, { "User-Agent": "Mozilla/5.0 VolatilityResearch/1.0" });
  const result = payload.chart?.result?.[0];
  if (!result || payload.chart?.error) throw new Error(`${definition.symbol}: ${payload.chart?.error?.description ?? "no data"}`);
  const quote = result.indicators?.quote?.[0] ?? {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  return result.timestamp.flatMap((timestamp, index) => {
    const close = quote.close?.[index];
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    if (close == null || date > TODAY) return [];
    return [{
      date,
      open: quote.open?.[index] ?? null,
      high: quote.high?.[index] ?? null,
      low: quote.low?.[index] ?? null,
      close,
      adjustedClose: adjusted[index] ?? close,
      volume: quote.volume?.[index] ?? null,
      amount: null,
    }];
  });
}

async function fetchEastmoney(definition) {
  const parameters = new URLSearchParams({
    secid: definition.secid,
    klt: "101",
    fqt: "0",
    beg: "0",
    end: "20500101",
    lmt: "1000000",
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
  });
  const headers = {
    Referer: "https://quote.eastmoney.com/",
    "User-Agent": "Mozilla/5.0 VolatilityResearch/1.0",
  };
  let payload;
  let lastError;
  for (const protocol of ["https", "http"]) {
    try {
      payload = await fetchJson(`${protocol}://push2his.eastmoney.com/api/qt/stock/kline/get?${parameters}`, headers);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!payload) throw lastError;
  return (payload.data?.klines ?? []).flatMap((line) => {
    const [date, open, close, high, low, volume, amount] = line.split(",");
    if (!date || date > TODAY) return [];
    return [{
      date,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      adjustedClose: Number(close),
      volume: Number(volume),
      amount: Number(amount),
    }];
  });
}

function validateRows(definition, rows) {
  const deduplicated = [...new Map(rows.map((row) => [row.date, row])).values()].sort((left, right) => left.date.localeCompare(right.date));
  const valid = deduplicated.filter((row) => {
    const prices = [row.open, row.high, row.low, row.close, row.adjustedClose].filter((value) => value != null);
    return prices.length >= 4 && prices.every((value) => Number.isFinite(value) && value > 0)
      && row.high >= Math.max(row.open, row.close)
      && row.low <= Math.min(row.open, row.close);
  });
  if (valid.length < 1_000) throw new Error(`${definition.name}: only ${valid.length} valid rows`);
  return {
    rows: valid,
    quality: {
      received: rows.length,
      valid: valid.length,
      dropped: rows.length - valid.length,
      firstDate: valid[0].date,
      lastDate: valid.at(-1).date,
    },
  };
}

function rollingStd(values, endIndex, window) {
  if (endIndex + 1 < window) return null;
  return standardDeviation(values.slice(endIndex - window + 1, endIndex + 1));
}

function futureLogReturn(rows, index, horizon) {
  const future = rows[index + horizon]?.adjustedClose;
  const current = rows[index]?.adjustedClose;
  return future && current ? Math.log(future / current) * 100 : null;
}

function futureVolatility(logReturns, index, horizon) {
  const values = logReturns.slice(index + 1, index + horizon + 1).filter(Number.isFinite);
  return values.length < horizon ? null : standardDeviation(values) * ANNUALIZATION * 100;
}

function deriveSeries(rows) {
  const logReturns = rows.map((row, index) => index === 0 ? null : Math.log(row.adjustedClose / rows[index - 1].adjustedClose));
  return rows.map((row, index) => {
    const validReturns = logReturns.map((value) => value ?? Number.NaN);
    const rv20 = rollingStd(validReturns.slice(0, index + 1).filter(Number.isFinite), validReturns.slice(0, index + 1).filter(Number.isFinite).length - 1, 20);
    const rv60 = rollingStd(validReturns.slice(0, index + 1).filter(Number.isFinite), validReturns.slice(0, index + 1).filter(Number.isFinite).length - 1, 60);
    const downsideWindow = logReturns.slice(Math.max(1, index - 19), index + 1).filter((value) => value != null && value < 0);
    return {
      ...row,
      logReturnPct: logReturns[index] == null ? null : logReturns[index] * 100,
      simpleReturnPct: index === 0 ? null : (row.adjustedClose / rows[index - 1].adjustedClose - 1) * 100,
      realizedVol20Pct: rv20 == null ? null : rv20 * ANNUALIZATION * 100,
      realizedVol60Pct: rv60 == null ? null : rv60 * ANNUALIZATION * 100,
      downsideVol20Pct: downsideWindow.length < 5 ? null : standardDeviation(downsideWindow) * ANNUALIZATION * 100,
      forwardVol20Pct: futureVolatility(logReturns, index, 20),
      forwardReturn5Pct: futureLogReturn(rows, index, 5),
      forwardReturn20Pct: futureLogReturn(rows, index, 20),
      forwardReturn60Pct: futureLogReturn(rows, index, 60),
    };
  }).map((row, index, series) => ({
    ...row,
    changeInVol20Pct: row.realizedVol20Pct == null || series[index - 1]?.realizedVol20Pct == null
      ? null
      : row.realizedVol20Pct - series[index - 1].realizedVol20Pct,
  }));
}

function completePairs(rows, leftKey, rightKey) {
  const pairs = rows.filter((row) => Number.isFinite(row[leftKey]) && Number.isFinite(row[rightKey]));
  return { left: pairs.map((row) => row[leftKey]), right: pairs.map((row) => row[rightKey]), rows: pairs };
}

function comparableStatistics(rows) {
  const sample = rows.filter((row) => row.date >= COMPARABLE_START);
  const returns = sample.map((row) => row.logReturnPct).filter(Number.isFinite);
  const returnVolChange = completePairs(sample, "logReturnPct", "changeInVol20Pct");
  const returnFutureVol = completePairs(sample, "logReturnPct", "forwardVol20Pct");
  const volForward20 = completePairs(sample, "realizedVol20Pct", "forwardReturn20Pct");
  const regression = linearRegression(volForward20.left, volForward20.right);
  const shocks = sample.filter((row) => Number.isFinite(row.logReturnPct) && Number.isFinite(row.forwardVol20Pct));
  const negativeShockCutoff = quantile(shocks.map((row) => row.logReturnPct), .05);
  const positiveShockCutoff = quantile(shocks.map((row) => row.logReturnPct), .95);
  const negativeShocks = shocks.filter((row) => row.logReturnPct <= negativeShockCutoff);
  const positiveShocks = shocks.filter((row) => row.logReturnPct >= positiveShockCutoff);
  const cutoffs = [0, .2, .4, .6, .8, 1].map((probability) => quantile(volForward20.left, probability));
  const volatilityQuintiles = Array.from({ length: 5 }, (_, index) => {
    const selected = volForward20.rows.filter((row) => row.realizedVol20Pct >= cutoffs[index]
      && (index === 4 ? row.realizedVol20Pct <= cutoffs[index + 1] : row.realizedVol20Pct < cutoffs[index + 1]));
    return {
      quintile: index + 1,
      label: index === 0 ? "最低波动" : index === 4 ? "最高波动" : `Q${index + 1}`,
      count: selected.length,
      volatilityRange: [round(cutoffs[index], 2), round(cutoffs[index + 1], 2)],
      averageForward20ReturnPct: round(mean(selected.map((row) => row.forwardReturn20Pct)), 3),
      medianForward20ReturnPct: round(quantile(selected.map((row) => row.forwardReturn20Pct), .5), 3),
      positiveRatePct: round(selected.filter((row) => row.forwardReturn20Pct > 0).length / Math.max(1, selected.length) * 100, 2),
    };
  });
  return {
    startDate: COMPARABLE_START,
    endDate: sample.at(-1)?.date ?? null,
    observations: sample.length,
    annualizedReturnPct: round((Math.exp(mean(returns) / 100 * 252) - 1) * 100, 3),
    annualizedVolatilityPct: round(standardDeviation(returns) * ANNUALIZATION, 3),
    leverageEffectCorrelation: round(correlation(returnVolChange.left, returnVolChange.right), 4),
    returnFutureVolatilityCorrelation: round(correlation(returnFutureVol.left, returnFutureVol.right), 4),
    volatilityForward20ReturnCorrelation: round(correlation(volForward20.left, volForward20.right), 4),
    forward20Regression: {
      intercept: round(regression.intercept, 5),
      slopePerVolPoint: round(regression.slope, 5),
      rSquared: round(regression.rSquared, 5),
      samples: volForward20.left.length,
    },
    shockAnalysis: {
      negativeShockCutoffPct: round(negativeShockCutoff, 3),
      negativeShockCount: negativeShocks.length,
      averageForwardVol20AfterNegativeShockPct: round(mean(negativeShocks.map((row) => row.forwardVol20Pct)), 3),
      positiveShockCutoffPct: round(positiveShockCutoff, 3),
      positiveShockCount: positiveShocks.length,
      averageForwardVol20AfterPositiveShockPct: round(mean(positiveShocks.map((row) => row.forwardVol20Pct)), 3),
    },
    volatilityQuintiles,
  };
}

function summarize(definition, rows) {
  const returns = rows.map((row) => row.logReturnPct).filter(Number.isFinite);
  const annualizedReturn = (Math.exp(mean(returns) / 100 * 252) - 1) * 100;
  const annualizedVolatility = standardDeviation(returns) * ANNUALIZATION;
  const returnVolChange = completePairs(rows, "logReturnPct", "changeInVol20Pct");
  const returnFutureVol = completePairs(rows, "logReturnPct", "forwardVol20Pct");
  const volForward20 = completePairs(rows, "realizedVol20Pct", "forwardReturn20Pct");
  const volatilityPersistence = completePairs(rows, "realizedVol20Pct", "realizedVol60Pct");
  const regression = linearRegression(volForward20.left, volForward20.right);
  const cutoffs = [0, 0.2, 0.4, 0.6, 0.8, 1].map((probability) => quantile(volForward20.left, probability));
  const quintiles = Array.from({ length: 5 }, (_, index) => {
    const selected = volForward20.rows.filter((row) => row.realizedVol20Pct >= cutoffs[index]
      && (index === 4 ? row.realizedVol20Pct <= cutoffs[index + 1] : row.realizedVol20Pct < cutoffs[index + 1]));
    return {
      quintile: index + 1,
      label: index === 0 ? "最低波动" : index === 4 ? "最高波动" : `Q${index + 1}`,
      count: selected.length,
      volatilityRange: [round(cutoffs[index], 2), round(cutoffs[index + 1], 2)],
      averageForward20ReturnPct: round(mean(selected.map((row) => row.forwardReturn20Pct)), 3),
      medianForward20ReturnPct: round(quantile(selected.map((row) => row.forwardReturn20Pct), 0.5), 3),
      positiveRatePct: round(selected.filter((row) => row.forwardReturn20Pct > 0).length / Math.max(1, selected.length) * 100, 2),
    };
  });
  const shocks = rows.filter((row) => Number.isFinite(row.logReturnPct) && Number.isFinite(row.forwardReturn20Pct));
  const negativeShockCutoff = quantile(shocks.map((row) => row.logReturnPct), 0.05);
  const positiveShockCutoff = quantile(shocks.map((row) => row.logReturnPct), 0.95);
  const negativeShocks = shocks.filter((row) => row.logReturnPct <= negativeShockCutoff);
  const positiveShocks = shocks.filter((row) => row.logReturnPct >= positiveShockCutoff);
  const byDecade = new Map();
  for (const row of rows.filter((item) => Number.isFinite(item.logReturnPct))) {
    const decade = `${row.date.slice(0, 3)}0s`;
    const bucket = byDecade.get(decade) ?? [];
    bucket.push(row);
    byDecade.set(decade, bucket);
  }
  return {
    id: definition.id,
    name: definition.name,
    market: definition.market,
    source: definition.source,
    firstDate: rows[0].date,
    lastDate: rows.at(-1).date,
    observations: rows.length,
    annualizedReturnPct: round(annualizedReturn, 3),
    annualizedVolatilityPct: round(annualizedVolatility, 3),
    averageDailyReturnPct: round(mean(returns), 5),
    worstDayPct: round(Math.min(...returns), 3),
    bestDayPct: round(Math.max(...returns), 3),
    leverageEffectCorrelation: round(correlation(returnVolChange.left, returnVolChange.right), 4),
    returnFutureVolatilityCorrelation: round(correlation(returnFutureVol.left, returnFutureVol.right), 4),
    volatilityForward20ReturnCorrelation: round(correlation(volForward20.left, volForward20.right), 4),
    volatilityPersistenceCorrelation: round(correlation(volatilityPersistence.left, volatilityPersistence.right), 4),
    forward20Regression: {
      intercept: round(regression.intercept, 5),
      slopePerVolPoint: round(regression.slope, 5),
      rSquared: round(regression.rSquared, 5),
      samples: volForward20.left.length,
    },
    shockAnalysis: {
      negativeShockCutoffPct: round(negativeShockCutoff, 3),
      negativeShockCount: negativeShocks.length,
      averageForward20AfterNegativeShockPct: round(mean(negativeShocks.map((row) => row.forwardReturn20Pct)), 3),
      averageForwardVol20AfterNegativeShockPct: round(mean(negativeShocks.map((row) => row.forwardVol20Pct).filter(Number.isFinite)), 3),
      positiveShockCutoffPct: round(positiveShockCutoff, 3),
      positiveShockCount: positiveShocks.length,
      averageForward20AfterPositiveShockPct: round(mean(positiveShocks.map((row) => row.forwardReturn20Pct)), 3),
      averageForwardVol20AfterPositiveShockPct: round(mean(positiveShocks.map((row) => row.forwardVol20Pct).filter(Number.isFinite)), 3),
    },
    volatilityQuintiles: quintiles,
    comparableSince2005: comparableStatistics(rows),
    decades: [...byDecade.entries()].map(([decade, bucket]) => ({
      decade,
      observations: bucket.length,
      annualizedReturnPct: round((Math.exp(mean(bucket.map((row) => row.logReturnPct)) / 100 * 252) - 1) * 100, 3),
      annualizedVolatilityPct: round(standardDeviation(bucket.map((row) => row.logReturnPct)) * ANNUALIZATION, 3),
    })),
  };
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns) {
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")).join("\n")}\n`;
}

function svgEscape(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function linePath(points, x, y) {
  return points.map((point, index) => `${index ? "L" : "M"}${x(point).toFixed(1)},${y(point).toFixed(1)}`).join(" ");
}

function timeSeriesSvg(definition, rows) {
  const width = 1280, height = 520, left = 72, right = 70, top = 44, bottom = 54;
  const samples = rows.filter((row) => row.realizedVol20Pct != null);
  const step = Math.max(1, Math.ceil(samples.length / 1800));
  const points = samples.filter((_, index) => index % step === 0 || index === samples.length - 1);
  const minDate = new Date(points[0].date).getTime(), maxDate = new Date(points.at(-1).date).getTime();
  const closes = points.map((point) => point.close), vols = points.map((point) => point.realizedVol20Pct);
  const minClose = Math.min(...closes), maxClose = Math.max(...closes), maxVol = quantile(vols, 0.995) * 1.1;
  const x = (point) => left + (new Date(point.date).getTime() - minDate) / (maxDate - minDate) * (width - left - right);
  const yPrice = (point) => top + (1 - (point.close - minClose) / (maxClose - minClose)) * (height - top - bottom);
  const yVol = (point) => top + (1 - Math.min(point.realizedVol20Pct, maxVol) / maxVol) * (height - top - bottom);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#0f1417"/><text x="${left}" y="26" fill="#f2f4f5" font-size="17" font-family="sans-serif">${svgEscape(definition.name)}：指数与20日年化实现波动率</text>
<g stroke="#ffffff18">${[0,.25,.5,.75,1].map(t=>`<line x1="${left}" x2="${width-right}" y1="${top+t*(height-top-bottom)}" y2="${top+t*(height-top-bottom)}"/>`).join("")}</g>
<path d="${linePath(points,x,yPrice)}" fill="none" stroke="#d49a54" stroke-width="1.5"/><path d="${linePath(points,x,yVol)}" fill="none" stroke="#55a8a1" stroke-width="1.2" opacity=".9"/>
<text x="${left}" y="${height-18}" fill="#9ba7b3" font-size="11">${points[0].date}</text><text x="${width-right}" y="${height-18}" text-anchor="end" fill="#9ba7b3" font-size="11">${points.at(-1).date}</text>
<text x="${left}" y="${top-8}" fill="#d49a54" font-size="11">指数 ${minClose.toFixed(1)}–${maxClose.toFixed(1)}</text><text x="${width-right}" y="${top-8}" text-anchor="end" fill="#55a8a1" font-size="11">波动率 0–${maxVol.toFixed(1)}%</text></svg>`;
}

function scatterSvg(definition, rows, summary) {
  const width = 800, height = 540, left = 70, right = 34, top = 52, bottom = 58;
  const all = rows.filter((row) => row.date >= COMPARABLE_START && Number.isFinite(row.realizedVol20Pct) && Number.isFinite(row.forwardReturn20Pct));
  const step = Math.max(1, Math.ceil(all.length / 2500));
  const points = all.filter((_, index) => index % step === 0);
  const maxX = quantile(all.map((row) => row.realizedVol20Pct), .99);
  const minY = quantile(all.map((row) => row.forwardReturn20Pct), .01);
  const maxY = quantile(all.map((row) => row.forwardReturn20Pct), .99);
  const x = (value) => left + Math.min(value, maxX) / maxX * (width-left-right);
  const y = (value) => top + (1-(Math.max(minY,Math.min(maxY,value))-minY)/(maxY-minY))*(height-top-bottom);
  const reg = summary.comparableSince2005.forward20Regression;
  const y0 = reg.intercept, y1 = reg.intercept + reg.slopePerVolPoint * maxX;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#0f1417"/><text x="${left}" y="28" fill="#f2f4f5" font-size="16" font-family="sans-serif">${svgEscape(definition.name)}：当前波动率 vs 未来20日收益（2005起）</text><line x1="${left}" x2="${width-right}" y1="${y(0)}" y2="${y(0)}" stroke="#ffffff32"/>${points.map(point=>`<circle cx="${x(point.realizedVol20Pct).toFixed(1)}" cy="${y(point.forwardReturn20Pct).toFixed(1)}" r="1.4" fill="#8aa9b2" opacity=".28"/>`).join("")}<line x1="${x(0)}" y1="${y(y0)}" x2="${x(maxX)}" y2="${y(y1)}" stroke="#e7685d" stroke-width="2"/><text x="${left}" y="${height-18}" fill="#9ba7b3" font-size="11">20日实现波动率（年化%）</text><text x="${width-right}" y="${top-8}" text-anchor="end" fill="#9ba7b3" font-size="11">corr=${summary.comparableSince2005.volatilityForward20ReturnCorrelation ?? "--"} · R²=${reg.rSquared ?? "--"}</text></svg>`;
}

function quintileSvg(summaries) {
  const width=1100,height=520,left=80,right=30,top=54,bottom=80;
  const values=summaries.flatMap(summary=>summary.comparableSince2005.volatilityQuintiles.map(item=>item.averageForward20ReturnPct));
  const limit=Math.max(1,Math.max(...values.map(Math.abs))*1.15);
  const groupWidth=(width-left-right)/summaries.length,barWidth=groupWidth/7;
  const y=value=>top+(limit-value)/(2*limit)*(height-top-bottom);
  const colors=["#55a8a1","#78a89d","#aab4be","#d49a54","#e7685d"];
  const bars=summaries.flatMap((summary,group)=>summary.comparableSince2005.volatilityQuintiles.map((item,index)=>{const x=left+group*groupWidth+(index+1)*barWidth;const y0=y(0),yv=y(item.averageForward20ReturnPct);return `<rect x="${x}" y="${Math.min(y0,yv)}" width="${barWidth*.72}" height="${Math.max(1,Math.abs(yv-y0))}" fill="${colors[index]}"/><text x="${x+barWidth*.36}" y="${item.averageForward20ReturnPct>=0?yv-5:yv+13}" text-anchor="middle" fill="#c4cbd2" font-size="9">${item.averageForward20ReturnPct}</text>`;}));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#0f1417"/><text x="${left}" y="28" fill="#f2f4f5" font-size="17" font-family="sans-serif">波动率五分位与随后20日平均收益（2005起）</text><line x1="${left}" x2="${width-right}" y1="${y(0)}" y2="${y(0)}" stroke="#ffffff44"/>${bars.join("")}${summaries.map((summary,index)=>`<text x="${left+(index+.5)*groupWidth}" y="${height-42}" text-anchor="middle" fill="#e1e5e8" font-size="12">${svgEscape(summary.name)}</text>`).join("")}<text x="${left}" y="${height-17}" fill="#9ba7b3" font-size="10">统一样本 ${COMPARABLE_START} 起；每组从左至右：最低波动 → 最高波动</text></svg>`;
}

async function fetchFred(id) {
  const csv = await fetchPayload(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`,
    { "User-Agent": "Mozilla/5.0 VolatilityResearch/1.0" },
    (response) => response.text(),
  );
  const lines = csv.trim().split(/\r?\n/).slice(1);
  return new Map(lines.flatMap((line) => {
    const [date, raw] = line.split(",");
    const value = Number(raw);
    return Number.isFinite(value) ? [[date, value]] : [];
  }));
}

async function crossValidate(seriesById) {
  const checks = [];
  for (const [id, fredId] of [["sp500", "SP500"], ["nasdaq-composite", "NASDAQCOM"]]) {
    const fred = await fetchFred(fredId);
    const overlap = seriesById[id].filter((row) => fred.has(row.date)).slice(-500);
    const errors = overlap.map((row) => Math.abs(row.close - fred.get(row.date)) / fred.get(row.date) * 100);
    checks.push({ id, comparison: `FRED ${fredId}`, overlap: overlap.length, medianAbsolutePctError: round(quantile(errors, .5), 6), maxAbsolutePctError: round(Math.max(...errors), 6) });
  }
  return checks;
}

function reportHtml(manifest, summaries) {
  const cards=summaries.map(summary=>`<article><h2>${summary.name}</h2><div class="metrics"><b>${summary.observations.toLocaleString()}</b><span>全量交易日</span><b>${summary.comparableSince2005.annualizedReturnPct}%</b><span>2005起年化收益</span><b>${summary.comparableSince2005.annualizedVolatilityPct}%</b><span>2005起年化波动</span></div><p>收益→未来20日波动相关：<strong>${summary.comparableSince2005.returnFutureVolatilityCorrelation}</strong>；当前波动→未来20日收益相关：<strong>${summary.comparableSince2005.volatilityForward20ReturnCorrelation}</strong>。</p><img src="charts/${summary.id}-timeseries.svg"><img class="scatter" src="charts/${summary.id}-scatter.svg"></article>`).join("");
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>四大指数波动率与收益率分析</title><style>body{margin:0;background:#090d0f;color:#eef2f5;font:14px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}main{max-width:1320px;margin:auto;padding:36px 20px}h1{font-size:30px}p{color:#aeb8c2;line-height:1.75}.note{border-block:1px solid #ffffff20;padding:14px 0;margin:24px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}article{background:#141a1e;border:1px solid #ffffff20;padding:20px}article h2{margin-top:0}.metrics{display:grid;grid-template-columns:auto 1fr auto 1fr auto 1fr;gap:8px;align-items:baseline}.metrics span{color:#8d99a5;font-size:11px}img{width:100%;display:block;margin-top:16px}.scatter{max-width:800px}a{color:#70b8b0}@media(max-width:800px){.grid{grid-template-columns:1fr}.metrics{grid-template-columns:auto 1fr}.scatter{max-width:none}}</style><main><h1>四大指数：波动率与收益率关系</h1><p>生成时间 ${manifest.generatedAt}。收益使用日对数收益；实现波动率为过去20个交易日日收益标准差 × √252；“未来20日收益”严格使用随后20个交易日，避免同期机械相关。</p><div class="note"><b>解释边界：</b>相关关系不是因果。收益→波动变化用于观察不对称冲击；当前波动→未来收益用于检验高波动是否带来风险补偿。完整原始与派生 CSV 位于 <a href="raw/">raw/</a> 和 <a href="derived/">derived/</a>。</div><img src="charts/volatility-quintiles.svg"><div class="grid">${cards}</div></main></html>`;
}

async function main() {
  await Promise.all([RAW_DIR, DERIVED_DIR, CHART_DIR].map((directory) => mkdir(directory, { recursive: true })));
  const seriesById = {};
  const summaries = [];
  const quality = [];
  for (const definition of INDEXES) {
    const raw = definition.type === "yahoo" ? await fetchYahoo(definition) : await fetchEastmoney(definition);
    const validated = validateRows(definition, raw);
    const derived = deriveSeries(validated.rows);
    const summary = summarize(definition, derived);
    seriesById[definition.id] = validated.rows;
    summaries.push(summary);
    quality.push({ id: definition.id, name: definition.name, source: definition.source, ...validated.quality });
    await writeFile(path.join(RAW_DIR, `${definition.id}.csv`), toCsv(validated.rows, ["date","open","high","low","close","adjustedClose","volume","amount"]));
    await writeFile(path.join(DERIVED_DIR, `${definition.id}.csv`), toCsv(derived.map((row) => Object.fromEntries(Object.entries(row).map(([key,value])=>[key,round(value,6)]))), ["date","open","high","low","close","adjustedClose","volume","amount","logReturnPct","simpleReturnPct","realizedVol20Pct","realizedVol60Pct","downsideVol20Pct","changeInVol20Pct","forwardVol20Pct","forwardReturn5Pct","forwardReturn20Pct","forwardReturn60Pct"]));
    await writeFile(path.join(CHART_DIR, `${definition.id}-timeseries.svg`), timeSeriesSvg(definition, derived));
    await writeFile(path.join(CHART_DIR, `${definition.id}-scatter.svg`), scatterSvg(definition, derived, summary));
  }
  const validation = await crossValidate(seriesById);
  const manifest = {
    generatedAt: new Date().toISOString(),
    methodology: {
      return: "daily log return from adjustedClose (indices have no distributions)",
      realizedVolatility: "trailing 20/60 trading-day sample standard deviation, annualized with sqrt(252); forwardVol20 uses the next 20 returns",
      comparableSample: `${COMPARABLE_START} onward for all four indices`,
      predictiveReturn: "forward 5/20/60 trading-day log return; no overlapping correction applied",
      leverageEffect: "correlation(daily log return, daily change in trailing 20-day realized volatility)",
    },
    sources: INDEXES.map(({ id, name, source, symbol, secid }) => ({ id, name, source, symbol: symbol ?? secid })),
    quality,
    crossValidation: validation,
    files: { raw: "raw/*.csv", derived: "derived/*.csv", summary: "summary.json", charts: "charts/*.svg", report: "report.html" },
  };
  await writeFile(path.join(OUTPUT, "summary.json"), `${JSON.stringify({ manifest, indices: summaries }, null, 2)}\n`);
  await writeFile(path.join(OUTPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(CHART_DIR, "volatility-quintiles.svg"), quintileSvg(summaries));
  await writeFile(path.join(OUTPUT, "report.html"), reportHtml(manifest, summaries));
  console.log(JSON.stringify({ output: OUTPUT, quality, validation, summaries: summaries.map(({ id, observations, annualizedReturnPct, annualizedVolatilityPct, leverageEffectCorrelation, volatilityForward20ReturnCorrelation }) => ({ id, observations, annualizedReturnPct, annualizedVolatilityPct, leverageEffectCorrelation, volatilityForward20ReturnCorrelation })) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});