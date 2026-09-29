import dns from "node:dns";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dns.setDefaultResultOrder("ipv4first");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "public/data/hk-leading-indicator");
const WINDOW_MONTHS = 36;
const MINIMUM_OBSERVATIONS = 12;
const RETRY_DELAYS_MS = [0, 1_500, 4_000];
const EASTMONEY_ENDPOINT = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const NBS_DATA_ENDPOINT = "https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData";
const NBS_MONTHLY_ROOT = "fc982599aa684be7969d7b90b1bd0e84";
const MOFCOM_TSF_ENDPOINT = "https://data.mofcom.gov.cn/datamofcom/front/gnmy/shrzgmQuery";
const PBOC_TSF_TABLE_URL = "https://www.pbc.gov.cn/diaochatongjisi/attachDir/2026/09/2026091417323857622.htm";
const PBOC_HISTORICAL_TSF_URLS = [
  "https://www.pbc.gov.cn/eportal/fileDir/defaultCurSite/resource/cms/2015/07/2012s18.htm",
  "https://www.pbc.gov.cn/eportal/fileDir/defaultCurSite/resource/cms/2015/07/2013s18.htm",
];

function round(value, digits = 6) {
  return value == null || !Number.isFinite(value) ? null : +value.toFixed(digits);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values) {
  if (values.length < 2) return null;
  const center = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1));
}

function correlation(left, right) {
  if (left.length !== right.length || left.length < 3) return null;
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const leftSquares = left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0);
  const rightSquares = right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0);
  const denominator = Math.sqrt(leftSquares * rightSquares);
  return denominator ? numerator / denominator : null;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchResponse(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (RETRY_DELAYS_MS[attempt]) await wait(RETRY_DELAYS_MS[attempt]);
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return response;
      const error = new Error(`${response.status} ${response.statusText}: ${url}`);
      const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      if (!retryable || attempt === RETRY_DELAYS_MS.length - 1) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length - 1) throw error;
    }
  }
  throw lastError;
}

async function fetchJson(url, options = {}) {
  return (await fetchResponse(url, options)).json();
}

async function fetchText(url, options = {}, encoding = "utf-8") {
  const response = await fetchResponse(url, options);
  return new TextDecoder(encoding).decode(await response.arrayBuffer());
}

function monthKey(value) {
  const match = String(value ?? "").match(/(\d{4})[-/](\d{1,2})/);
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, "0")}` : null;
}

function monthOrdinal(value) {
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function ordinalMonth(ordinal) {
  return `${Math.floor(ordinal / 12)}-${String((ordinal % 12) + 1).padStart(2, "0")}`;
}

function monthsBetween(left, right) {
  return monthOrdinal(right) - monthOrdinal(left);
}

function numeric(value) {
  if (value == null || value === "" || value === "--") return null;
  const parsed = Number(String(value).replaceAll(",", "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function pickNumber(record, candidates, label) {
  for (const candidate of candidates) {
    const value = numeric(record[candidate]);
    if (value != null) return value;
  }
  if (candidates.some((candidate) => candidate in record)) return null;
  throw new Error(`${label}: no numeric field among ${candidates.join(", ")}; available fields: ${Object.keys(record).join(", ")}`);
}

function sortedMap(entries) {
  return new Map(
    [...entries]
      .filter(([date, value]) => date && value != null && Number.isFinite(value))
      .sort((left, right) => left[0].localeCompare(right[0])),
  );
}

async function fetchEastmoneyReport(reportName) {
  const payload = await fetchJson(eastmoneyReportUrl(reportName), {
    headers: {
      Referer: "https://data.eastmoney.com/",
      "User-Agent": "Mozilla/5.0 HkLeadingIndicator/1.0",
    },
  });
  const records = payload.result?.data;
  if (!Array.isArray(records) || !records.length) throw new Error(`${reportName}: empty Eastmoney response`);
  return records;
}

function eastmoneyReportUrl(reportName) {
  const parameters = new URLSearchParams({
    reportName,
    columns: "ALL",
    sortColumns: "REPORT_DATE",
    sortTypes: "1",
    pageNumber: "1",
    pageSize: "500",
    source: "WEB",
    client: "WEB",
  });
  return `${EASTMONEY_ENDPOINT}?${parameters}`;
}

async function fetchNbsMonthly({ cid, indicatorId, start, end, transform }) {
  const payload = await fetchJson(NBS_DATA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 HkLeadingIndicator/1.0",
    },
    body: JSON.stringify({
      cid,
      indicatorIds: [indicatorId],
      daCatalogId: "",
      das: [{ text: "全国", value: "000000000000" }],
      showType: "1",
      rootId: NBS_MONTHLY_ROOT,
      dts: [`${start.replace("-", "")}MM-${end.replace("-", "")}MM`],
    }),
  });
  if (!Array.isArray(payload.data) || !payload.data.length) throw new Error(`NBS ${indicatorId}: empty response`);
  return sortedMap(payload.data.map((row) => {
    const date = String(row.code ?? "").match(/^(\d{4})(\d{2})MM$/);
    const value = numeric(row.values?.find((item) => item._id === indicatorId)?.value);
    return [date ? `${date[1]}-${date[2]}` : null, value == null ? null : transform(value)];
  }));
}

async function fetchHkM2() {
  const url = "https://api.hkma.gov.hk/public/market-data-and-statistics/monthly-statistical-bulletin/money/supply-components-all";
  const records = [];
  try {
    for (let offset = 0; ; offset += 100) {
      const payload = await fetchJson(`${url}?offset=${offset}&pagesize=100`, {
        headers: { "User-Agent": "Mozilla/5.0 HkLeadingIndicator/1.0" },
      });
      const page = payload.result?.records;
      if (!Array.isArray(page) || !page.length) break;
      records.push(...page);
      if (page.length < 100) break;
    }
  } catch (error) {
    const cached = await readCachedHkM2(url);
    console.warn(`HKMA M2 refresh failed; using the tracked source cache: ${String(error)}`);
    return cached;
  }
  if (!records.length) throw new Error("HKMA M2: empty response");
  const levels = sortedMap(records.map((record) => [
    monthKey(record.end_of_month ?? record.date),
    pickNumber(record, ["m2_supply", "total_m2", "m2_total"], "HKMA total M2"),
  ]));
  const yoy = [];
  for (const [date, level] of levels) {
    const prior = levels.get(ordinalMonth(monthOrdinal(date) - 12));
    if (prior != null && prior !== 0) yoy.push([date, (level / prior - 1) * 100]);
  }
  return { url, levels, yoy: sortedMap(yoy) };
}

async function readCachedHkM2(url) {
  try {
    const cache = JSON.parse(await readFile(path.join(OUTPUT, "source-cache.json"), "utf8"));
    const yoy = sortedMap(cache.hkM2YoY.map((row) => [row.date, row.value]));
    if (yoy.size) return { url, levels: yoy, yoy };
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  const summary = JSON.parse(await readFile(path.join(OUTPUT, "summary.json"), "utf8"));
  const source = summary.sources?.find((item) => item.id === "hk-m2");
  const lastObservation = String(source?.coverage ?? "").match(/至 (\d{4}-\d{2})/)?.[1] ?? "9999-12";
  const releaseAligned = String(summary.methodology?.realTimeNote ?? "").includes("顺延一个月");
  const yoy = sortedMap(summary.series.flatMap((row) => {
    if (row.hkM2YoY == null || row.date > (releaseAligned ? ordinalMonth(monthOrdinal(lastObservation) + 1) : lastObservation)) return [];
    const date = releaseAligned ? ordinalMonth(monthOrdinal(row.date) - 1) : row.date;
    return [[date, row.hkM2YoY]];
  }));
  if (!yoy.size) throw new Error("HKMA M2 source cache is unavailable");
  return { url, levels: yoy, yoy };
}

async function fetchChinaPpi() {
  try {
    return await fetchNbsMonthly({
      cid: "60e8b361f11c4a878c652a6487a25561",
      indicatorId: "150633e52b9a470a9a9fd1b296dd6c5b",
      start: "1993-01",
      end: new Date().toISOString().slice(0, 7),
      transform: (value) => value - 100,
    });
  } catch (error) {
    console.warn(`NBS PPI refresh failed; using the public mirror: ${String(error)}`);
    const records = await fetchEastmoneyReport("RPT_ECONOMY_PPI");
    return sortedMap(records.map((record) => [
      monthKey(record.REPORT_DATE ?? record.TIME),
      pickNumber(record, ["BASE_SAME", "PPI_BASE_SAME", "SAME", "YOY"], "China PPI YoY"),
    ]));
  }
}

async function fetchChinaRetail() {
  try {
    return await fetchNbsMonthly({
      cid: "d0cb882c7f27443ab6b3ef9421901961",
      indicatorId: "aaac57d54d2e465d91bc9f3ea1a8618e",
      start: "2000-01",
      end: new Date().toISOString().slice(0, 7),
      transform: (value) => value,
    });
  } catch (error) {
    console.warn(`NBS retail refresh failed; using the public mirror: ${String(error)}`);
    const records = await fetchEastmoneyReport("RPT_ECONOMY_TOTAL_RETAIL");
    return sortedMap(records.map((record) => [
      monthKey(record.REPORT_DATE ?? record.TIME),
      pickNumber(record, ["RETAIL_TOTAL_SAME", "TOTAL_RETAIL_SAME", "RETAIL_SAME", "SAME", "YOY"], "China retail sales YoY"),
    ]));
  }
}

async function fetchChinaTsf() {
  const [records, ...officialTables] = await Promise.all([
    fetchJson(MOFCOM_TSF_ENDPOINT, {
      method: "POST",
      headers: {
        Referer: "https://data.mofcom.gov.cn/gnmy/shrzgm.shtml",
        "User-Agent": "Mozilla/5.0 HkLeadingIndicator/1.0",
      },
    }),
    fetchText(PBOC_TSF_TABLE_URL, {
      headers: { "User-Agent": "Mozilla/5.0 HkLeadingIndicator/1.0" },
    }, "gb18030"),
    ...PBOC_HISTORICAL_TSF_URLS.map((url) => fetchText(url, {
      headers: { "User-Agent": "Mozilla/5.0 HkLeadingIndicator/1.0" },
    }, "gb18030")),
  ]);
  if (!Array.isArray(records) || !records.length) throw new Error("China TSF: empty MOFCOM response");
  const values = sortedMap(records.map((record) => [
    String(record.date).length === 6 ? `${String(record.date).slice(0, 4)}-${String(record.date).slice(4)}` : monthKey(record.date),
    pickNumber(record, ["tiosfs"], "China TSF monthly flow"),
  ]));
  for (const table of officialTables) {
    for (const [date, value] of parsePbcAfreTable(table)) values.set(date, value);
  }
  return sortedMap(values);
}

function parsePbcAfreTable(html) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cell) => cell[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim())
  );
  const output = new Map();
  for (const cells of rows) {
    if (!/^\d{4}\.\d{2}$/.test(cells[0] ?? "")) continue;
    const value = numeric(cells[1]);
    if (value != null) output.set(cells[0].replace(".", "-"), value);
  }
  const header = rows.find((cells) => cells.slice(1).filter((cell) => /^\d{4}\.\d{2}$/.test(cell)).length >= 6);
  const afre = rows.find((cells) =>
    cells.length > 6
    && cells[0]?.includes("Aggregate Financing to the Real Economy")
    && !cells[0]?.includes("Of which")
  );
  if (header && afre) {
    header.slice(1).forEach((date, index) => {
      const value = numeric(afre[index + 1]);
      if (/^\d{4}\.\d{2}$/.test(date) && value != null) output.set(date.replace(".", "-"), value);
    });
  }
  return output;
}

async function fetchChinaGdp() {
  const records = await fetchEastmoneyReport("RPT_ECONOMY_GDP");
  const cumulative = sortedMap(records.map((record) => [
    monthKey(record.REPORT_DATE ?? record.TIME),
    pickNumber(record, ["DOMESTICL_PRODUCT_BASE", "DOMESTIC_PRODUCT_BASE", "GDP", "VALUE"], "China nominal GDP"),
  ]));
  const quarters = new Map();
  for (const [date, value] of cumulative) {
    const [year, month] = date.split("-").map(Number);
    const previous = month === 3 ? 0 : cumulative.get(`${year}-${String(month - 3).padStart(2, "0")}`);
    if (previous != null) quarters.set(date, value - previous);
  }
  const trailingTwoQuarter = new Map();
  const quarterDates = [...quarters.keys()];
  for (let index = 1; index < quarterDates.length; index += 1) {
    const dates = quarterDates.slice(index - 1, index + 1);
    trailingTwoQuarter.set(quarterDates[index], dates.reduce((sum, date) => sum + quarters.get(date), 0));
  }
  return { cumulative, trailingTwoQuarter };
}

async function fetchHsi() {
  const period2 = Math.floor(Date.now() / 1000) + 86_400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EHSI?period1=0&period2=${period2}&interval=1d&events=history`;
  const payload = await fetchJson(url, { headers: { "User-Agent": "Mozilla/5.0 HkLeadingIndicator/1.0" } });
  const result = payload.chart?.result?.[0];
  if (!result || payload.chart?.error) throw new Error(`Hang Seng: ${payload.chart?.error?.description ?? "no data"}`);
  const closes = result.indicators?.adjclose?.[0]?.adjclose ?? result.indicators?.quote?.[0]?.close ?? [];
  const exchangeOffsetSeconds = result.meta?.gmtoffset ?? 0;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const daily = sortedMap(result.timestamp.map((timestamp, index) => [
    new Date((timestamp + exchangeOffsetSeconds) * 1_000).toISOString().slice(0, 10),
    numeric(closes[index]),
  ]));
  const monthly = new Map();
  for (const [date, close] of daily) {
    const month = date.slice(0, 7);
    if (month < currentMonth) monthly.set(month, close);
  }
  return {
    url,
    daily,
    values: sortedMap(monthly),
  };
}

function monthlyRange(start, end) {
  const values = [];
  for (let ordinal = monthOrdinal(start); ordinal <= monthOrdinal(end); ordinal += 1) values.push(ordinalMonth(ordinal));
  return values;
}

function carryForward(source, months, maximumGap = 1) {
  const output = new Map();
  let latestDate = null;
  let latestValue = null;
  for (const month of months) {
    const current = source.get(month);
    if (current != null) {
      latestDate = month;
      latestValue = current;
      output.set(month, current);
    } else if (latestDate && latestValue != null && monthsBetween(latestDate, month) <= maximumGap) {
      output.set(month, latestValue);
    }
  }
  return output;
}

function shiftMonths(source, offset) {
  return sortedMap([...source].map(([date, value]) => [ordinalMonth(monthOrdinal(date) + offset), value]));
}

function forwardFillQuarterly(source, months) {
  const output = new Map();
  let latest = null;
  for (const month of months) {
    if (source.has(month)) latest = source.get(month);
    if (latest != null) output.set(month, latest);
  }
  return output;
}

function rollingSum(source, months, window) {
  const output = new Map();
  for (let index = window - 1; index < months.length; index += 1) {
    const dates = months.slice(index - window + 1, index + 1);
    const values = dates.map((date) => source.get(date));
    if (values.every((value) => value != null)) output.set(months[index], values.reduce((sum, value) => sum + value, 0));
  }
  return output;
}

function movingAverage(source, months, window) {
  const output = new Map();
  for (let index = window - 1; index < months.length; index += 1) {
    const values = months.slice(index - window + 1, index + 1).map((date) => source.get(date));
    if (values.every((value) => value != null)) output.set(months[index], mean(values));
  }
  return output;
}

function creditImpulse(tsf, gdp, months) {
  const rollingSixMonthFlow = rollingSum(tsf, months, 6);
  const raw = new Map();
  for (const month of months) {
    const current = rollingSixMonthFlow.get(month);
    const denominator = gdp.get(month);
    if (current != null && denominator) raw.set(month, (current / denominator) * 100);
  }
  return movingAverage(raw, months, 3);
}

function rollingZScore(source, months) {
  const output = new Map();
  for (let index = 0; index < months.length; index += 1) {
    const date = months[index];
    const value = source.get(date);
    if (value == null) continue;
    const history = months
      .slice(Math.max(0, index - WINDOW_MONTHS + 1), index + 1)
      .map((month) => source.get(month))
      .filter((item) => item != null);
    if (history.length < MINIMUM_OBSERVATIONS) continue;
    const deviation = standardDeviation(history);
    output.set(date, deviation ? (value - mean(history)) / deviation : 0);
  }
  return output;
}

function rollingDailyZScore(source, window = 756, minimumObservations = 252) {
  const entries = [...source.entries()];
  const output = new Map();
  for (let index = 0; index < entries.length; index += 1) {
    const values = entries
      .slice(Math.max(0, index - window + 1), index + 1)
      .map((entry) => entry[1]);
    if (values.length < minimumObservations) continue;
    const deviation = standardDeviation(values);
    output.set(entries[index][0], deviation ? (entries[index][1] - mean(values)) / deviation : 0);
  }
  return output;
}

function buildComposite(zScores, months) {
  const output = new Map();
  for (const month of months) {
    const values = zScores.map((series) => series.get(month));
    if (values.every((value) => value != null)) output.set(month, mean(values));
  }
  return output;
}

function forwardReturn(hsi, date, months) {
  const current = hsi.get(date);
  const future = hsi.get(ordinalMonth(monthOrdinal(date) + months));
  return current && future ? (future / current - 1) * 100 : null;
}

function horizonStatistics(composite, hsi, months) {
  return [3, 6, 9, 12].map((horizon) => {
    const pairs = months.flatMap((date) => {
      const signal = composite.get(date);
      const result = forwardReturn(hsi, date, horizon);
      return signal == null || result == null ? [] : [[signal, result]];
    });
    const returns = pairs.map((pair) => pair[1]);
    return {
      months: horizon,
      correlation: round(correlation(pairs.map((pair) => pair[0]), returns)),
      sampleSize: pairs.length,
      medianReturnPct: round(median(returns)),
      positiveRatePct: round((returns.filter((value) => value > 0).length / returns.length) * 100),
    };
  });
}

function latestAnalogs(composite, hsi, months, latestDate) {
  const latestValue = composite.get(latestDate);
  const latestChange = latestValue - composite.get(ordinalMonth(monthOrdinal(latestDate) - 3));
  function candidates(distance) {
    return months.flatMap((date) => {
      if (date >= ordinalMonth(monthOrdinal(latestDate) - 12)) return [];
      const value = composite.get(date);
      const prior = composite.get(ordinalMonth(monthOrdinal(date) - 3));
      const result = forwardReturn(hsi, date, 6);
      if (value == null || prior == null || result == null || Math.abs(value - latestValue) > distance) return [];
      const change = value - prior;
      if (Math.sign(change) !== Math.sign(latestChange)) return [];
      return [{ date, result }];
    });
  }
  let matches = candidates(0.4);
  if (matches.length < 6) matches = candidates(0.85);
  const independent = [];
  for (const match of matches) {
    if (!independent.length || monthsBetween(independent.at(-1).date, match.date) >= 6) independent.push(match);
  }
  const returns = independent.map((item) => item.result);
  return {
    sampleSize: returns.length,
    medianForward6mPct: round(median(returns)),
    positiveRate6mPct: returns.length ? round((returns.filter((value) => value > 0).length / returns.length) * 100) : null,
  };
}

function turningCandidates(values, radius, minimumProminence, percentProminence = false) {
  const entries = [...values.entries()];
  const candidates = [];
  for (let index = radius; index < entries.length - radius; index += 1) {
    const [date, value] = entries[index];
    const neighbors = entries.slice(index - radius, index + radius + 1).filter((_, offset) => offset !== radius);
    const neighborValues = neighbors.map((entry) => entry[1]);
    const isPeak = neighborValues.every((neighbor) => value > neighbor);
    const isTrough = neighborValues.every((neighbor) => value < neighbor);
    if (!isPeak && !isTrough) continue;
    const comparison = isPeak ? Math.max(...neighborValues) : Math.min(...neighborValues);
    const prominence = percentProminence
      ? Math.abs(value / comparison - 1) * 100
      : Math.abs(value - comparison);
    if (prominence >= minimumProminence) candidates.push({ date, value, type: isPeak ? "peak" : "trough", prominence });
  }
  return candidates;
}

function selectTurningPoints(candidates, minimumSpacingMonths, maximumPoints) {
  const selected = [];
  for (const candidate of [...candidates].sort((left, right) => right.prominence - left.prominence)) {
    if (selected.every((point) => Math.abs(monthsBetween(point.date, candidate.date)) >= minimumSpacingMonths)) selected.push(candidate);
    if (selected.length === maximumPoints) break;
  }
  return selected.sort((left, right) => left.date.localeCompare(right.date));
}

function pairTurningPoints(composite, hsi, firstDate) {
  const indicatorCandidates = turningCandidates(
    new Map([...composite].filter(([date]) => date >= firstDate)),
    2,
    0.12,
  );
  const hsiCandidates = turningCandidates(
    new Map([...hsi].filter(([date]) => date >= firstDate)),
    2,
    2,
    true,
  );
  const indicatorPoints = selectTurningPoints(indicatorCandidates, 5, 20);
  const hsiPoints = selectTurningPoints(hsiCandidates, 4, 30);
  const usedHsiDates = new Set();
  return indicatorPoints.map((point) => {
    const matches = hsiPoints
      .filter((candidate) => candidate.type === point.type && !usedHsiDates.has(candidate.date))
      .map((candidate) => ({ ...candidate, leadMonths: monthsBetween(point.date, candidate.date) }))
      .filter((candidate) => candidate.leadMonths >= -2 && candidate.leadMonths <= 12)
      .sort((left, right) => Math.abs(left.leadMonths) - Math.abs(right.leadMonths));
    const match = matches[0] ?? null;
    if (match) usedHsiDates.add(match.date);
    return {
      id: `${point.type}-${point.date}`,
      type: point.type,
      indicatorDate: point.date,
      indicatorValue: round(point.value),
      hsiDate: match?.date ?? null,
      hsiClose: round(match?.value),
      leadMonths: match?.leadMonths ?? null,
      status: match ? "matched" : "indicator-only",
    };
  });
}

function signalFor(value, change3m, positiveComponents) {
  if (value >= 0.5 && change3m > 0.1 && positiveComponents >= 3) {
    return { tone: "supportive", label: "多数因子同步转强（研究观察）", summary: "合成状态偏正且多数因子同向，但历史相关仍不足以把它当成已证实的港股领先信号。" };
  }
  if (change3m > 0.15) {
    const breadth = positiveComponents >= 3 ? "多数因子共同改善" : "但只有少数因子为正，广度仍不足";
    return { tone: "recovering", label: "合成值边际修复（证据有限）", summary: `合成值近3个月改善，${breadth}；这只是宏观状态观察，仍需盈利和风险偏好确认。` };
  }
  if (value <= -0.5 && change3m <= 0) {
    return { tone: "restrictive", label: "宏观逆风", summary: "合成值处于收缩区且没有改善，港股中期上行需要盈利或政策提供额外补偿。" };
  }
  if (change3m < -0.15) {
    return { tone: "cooling", label: "动能降温", summary: "合成值近3个月回落，流动性与需求对港股的边际支持正在减弱。" };
  }
  return { tone: "neutral", label: "中性等待确认", summary: "合成值靠近零轴且变化不大，当前没有足够强的宏观方向信号。" };
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns) {
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")).join("\n")}\n`;
}

function coverage(source) {
  const dates = [...source.keys()];
  return `${dates[0]} 至 ${dates.at(-1)}（${dates.length}期）`;
}

async function main() {
  const [hkM2, chinaPpi, chinaRetail, chinaTsf, chinaGdp, hsi] = await Promise.all([
    fetchHkM2(),
    fetchChinaPpi(),
    fetchChinaRetail(),
    fetchChinaTsf(),
    fetchChinaGdp(),
    fetchHsi(),
  ]);

  const availableM2 = shiftMonths(hkM2.yoy, 1);
  const availablePpi = shiftMonths(chinaPpi, 1);
  const availableRetail = shiftMonths(chinaRetail, 1);
  const availableTsf = shiftMonths(chinaTsf, 1);
  const availableGdp = shiftMonths(chinaGdp.trailingTwoQuarter, 1);
  const starts = [
    ...availableM2.keys(),
    ...availablePpi.keys(),
    ...availableRetail.keys(),
    ...availableTsf.keys(),
    ...availableGdp.keys(),
  ].sort();
  const ends = [
    [...availableM2.keys()].at(-1),
    [...availablePpi.keys()].at(-1),
    [...availableRetail.keys()].at(-1),
    [...availableTsf.keys()].at(-1),
    [...availableGdp.keys()].at(-1),
    [...hsi.values.keys()].at(-1),
  ].filter(Boolean).sort();
  const months = monthlyRange(starts[0], ends.at(-1));
  const m2 = carryForward(availableM2, months, 1);
  const ppi = availablePpi;
  const retail = carryForward(availableRetail, months, 2);
  const tsf = availableTsf;
  const gdp = forwardFillQuarterly(availableGdp, months);
  const impulse = creditImpulse(tsf, gdp, months);
  const m2Z = rollingZScore(m2, months);
  const ppiZ = rollingZScore(ppi, months);
  const retailZ = rollingZScore(retail, months);
  const impulseZ = rollingZScore(impulse, months);
  const composite = buildComposite([m2Z, ppiZ, retailZ, impulseZ], months);
  const compositeDates = [...composite.keys()];
  console.log({
    hkM2: coverage(hkM2.yoy),
    chinaPpi: coverage(chinaPpi),
    chinaRetail: coverage(chinaRetail),
    chinaTsf: coverage(chinaTsf),
    chinaGdp: coverage(chinaGdp.trailingTwoQuarter),
    creditImpulse: coverage(impulse),
    standardized: [m2Z.size, ppiZ.size, retailZ.size, impulseZ.size],
  });
  if (compositeDates.length < 100) throw new Error(`Composite history is too short: ${compositeDates.length}`);
  const firstCompositeDate = compositeDates[0];
  const lastCompositeDate = compositeDates.at(-1);
  const hsiDates = [...hsi.values.keys()];
  const chartMonths = monthlyRange(firstCompositeDate, [lastCompositeDate, hsiDates.at(-1)].sort().at(-1));
  const series = chartMonths.map((date) => ({
    date,
    hsiClose: round(hsi.values.get(date)),
    composite: round(composite.get(date)),
    hkM2YoY: round(m2.get(date)),
    chinaPpiYoY: round(ppi.get(date)),
    chinaRetailYoY: round(retail.get(date)),
    creditImpulse: round(impulse.get(date)),
    hkM2Z: round(m2Z.get(date)),
    chinaPpiZ: round(ppiZ.get(date)),
    chinaRetailZ: round(retailZ.get(date)),
    creditImpulseZ: round(impulseZ.get(date)),
  }));

  const latestComposite = composite.get(lastCompositeDate);
  const prior3m = composite.get(ordinalMonth(monthOrdinal(lastCompositeDate) - 3));
  const change3m = prior3m == null ? null : latestComposite - prior3m;
  const latestHsiDate = hsiDates.at(-1);
  const factors = [
    { id: "hkM2", label: "香港 M2 总额同比", observationDate: [...hkM2.yoy.keys()].at(-1), source: m2, z: m2Z, unit: "%" },
    { id: "chinaPpi", label: "内地 PPI 同比", observationDate: [...chinaPpi.keys()].at(-1), source: ppi, z: ppiZ, unit: "%" },
    { id: "chinaRetail", label: "内地社零同比", observationDate: [...chinaRetail.keys()].at(-1), source: retail, z: retailZ, unit: "%" },
    { id: "creditImpulse", label: "信用脉冲代理（6个月）", observationDate: [...chinaTsf.keys()].at(-1), source: impulse, z: impulseZ, unit: "%GDP" },
  ];
  const latestComponents = factors.map((factor) => {
    const zScore = factor.z.get(lastCompositeDate);
    return {
      id: factor.id,
      label: factor.label,
      date: factor.observationDate,
      value: round(factor.source.get(lastCompositeDate)),
      unit: factor.unit,
      zScore: round(zScore),
      contribution: round(zScore * 0.25),
    };
  });
  const componentMonths = monthlyRange(
    [
      [...hkM2.yoy.keys()][0],
      [...chinaPpi.keys()][0],
      [...chinaRetail.keys()][0],
      [...chinaTsf.keys()][0],
      [...chinaGdp.trailingTwoQuarter.keys()][0],
    ].filter(Boolean).sort()[0],
    [
      [...hkM2.yoy.keys()].at(-1),
      [...chinaPpi.keys()].at(-1),
      [...chinaRetail.keys()].at(-1),
      [...chinaTsf.keys()].at(-1),
      [...chinaGdp.trailingTwoQuarter.keys()].at(-1),
    ].filter(Boolean).sort().at(-1),
  );
  const componentGdp = forwardFillQuarterly(chinaGdp.trailingTwoQuarter, componentMonths);
  const componentSixMonthFlow = rollingSum(chinaTsf, componentMonths, 6);
  const componentCreditRaw = new Map();
  for (const date of componentMonths) {
    const flow = componentSixMonthFlow.get(date);
    const denominator = componentGdp.get(date);
    if (flow != null && denominator) {
      componentCreditRaw.set(date, (flow / denominator) * 100);
    }
  }
  const componentCredit = creditImpulse(chinaTsf, componentGdp, componentMonths);
  const componentRows = componentMonths.map((date) => ({
    date,
    hkM2YoY: round(hkM2.yoy.get(date)),
    chinaPpiYoY: round(chinaPpi.get(date)),
    chinaRetailYoY: round(chinaRetail.get(date)),
    tsfMonthlyFlow100m: round(chinaTsf.get(date)),
    creditSixMonthFlow100m: round(componentSixMonthFlow.get(date)),
    nominalGdpTwoQuarter100m: round(componentGdp.get(date)),
    creditRawRatioPctGdp: round(componentCreditRaw.get(date)),
    creditFlowIntensityPctGdp: round(componentCredit.get(date)),
  }));
  const hsiDailyZ = rollingDailyZScore(hsi.daily);
  const lastTradingDateByMonth = new Map();
  for (const date of hsi.daily.keys()) lastTradingDateByMonth.set(date.slice(0, 7), date);
  const dailyPoints = [...hsi.daily].flatMap(([date, close]) => {
    const month = date.slice(0, 7);
    if (month < firstCompositeDate) return [];
    return [{
      date,
      hsiClose: round(close),
      hsiZ: round(hsiDailyZ.get(date)),
      composite: lastTradingDateByMonth.get(month) === date
        ? round(composite.get(month))
        : null,
      compositeMonth: lastTradingDateByMonth.get(month) === date && composite.has(month)
        ? month
        : null,
    }];
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    methodology: {
      rollingWindowMonths: WINDOW_MONTHS,
      minimumObservations: MINIMUM_OBSERVATIONS,
      compositeFormula: "香港 M2 总额同比、内地 PPI 同比、内地社零同比和社融流量强度分别计算最长36个月滚动 z-score，再按25%等权平均；至少12期后开始，前24期采用扩展窗口。",
      creditImpulseFormula: "为复刻原图，第四项采用6个月滚动新增社融除以最近两个季度名义 GDP，再取3个月移动平均。它是原图定义的信用脉冲代理。",
      realTimeNote: "四项观察值均保守顺延一个月到近似可交易的发布月，再做仅使用当时及以前数据的滚动标准化。历史值仍来自最新修订数据而非逐期冻结 vintage，因此属于发布月对齐的回溯研究，不是真正的实时回测。",
    },
    coverage: {
      firstCompositeDate,
      lastCompositeDate,
      firstHsiDate: hsiDates[0],
      lastHsiDate: latestHsiDate,
      observations: compositeDates.length,
    },
    latest: {
      compositeDate: lastCompositeDate,
      composite: round(latestComposite),
      change3m: round(change3m),
      hsiDate: latestHsiDate,
      hsiClose: round(hsi.values.get(latestHsiDate)),
      signal: signalFor(latestComposite, change3m ?? 0, latestComponents.filter((factor) => factor.zScore > 0).length),
      components: latestComponents,
      analog: latestAnalogs(composite, hsi.values, compositeDates, lastCompositeDate),
    },
    horizonStats: horizonStatistics(composite, hsi.values, compositeDates),
    turningPoints: pairTurningPoints(composite, hsi.values, ordinalMonth(monthOrdinal(lastCompositeDate) - 15 * 12)),
    sources: [
      {
        id: "hk-m2",
        name: "香港 M2 总额",
        organization: "香港金融管理局",
        url: hkM2.url,
        coverage: coverage(hkM2.levels),
        frequency: "月度",
        releaseLag: "约1个月",
        caveat: "同比由总额自行计算；外币存款会受到汇率折算影响。",
      },
      {
        id: "china-ppi",
        name: "内地 PPI 同比",
        organization: "国家统计局",
        url: "https://data.stats.gov.cn/dg/website/publicrelease/web/external/new/queryIndicatorsByCid?cid=60e8b361f11c4a878c652a6487a25561&dt=&name=",
        coverage: coverage(chinaPpi),
        frequency: "月度",
        releaseLag: "约10天",
        caveat: "上年同月=100的指数减100得到同比；数据为最新修订版本。",
      },
      {
        id: "china-retail",
        name: "社会消费品零售总额同比",
        organization: "国家统计局",
        url: "https://data.stats.gov.cn/dg/website/publicrelease/web/external/new/queryIndicatorsByCid?cid=d0cb882c7f27443ab6b3ef9421901961&dt=&name=",
        coverage: coverage(chinaRetail),
        frequency: "月度",
        releaseLag: "约15天",
        caveat: "2012年后1月、2月通常没有单月同比；固定权重模型保留上一条已知月度值，直到下一次单月数据发布。",
      },
      {
        id: "china-credit-impulse",
        name: "信用脉冲代理（6个月社融/两季度GDP）",
        organization: "中国人民银行、商务部公开数据、国家统计局公开镜像",
        url: PBOC_TSF_TABLE_URL,
        coverage: `${coverage(chinaTsf)}；GDP ${coverage(chinaGdp.cumulative)}`,
        frequency: "月度 / 季度",
        releaseLag: "约2至4周",
        caveat: "官方月表覆盖2012、2013及2015年至今，2014存在缺口；社融统计范围历年有扩充，季度 GDP 从下一月起使用。",
      },
      {
        id: "hsi",
        name: "恒生指数日收盘与月末收盘",
        organization: "Yahoo Finance",
        url: hsi.url,
        coverage: coverage(hsi.values),
        frequency: "日度 / 月度",
        releaseLag: "交易日后",
        caveat: "日线用于展示，模型统计仍按已完成月末收盘；不是恒生指数公司的授权历史数据产品。",
      },
    ],
    series,
  };

  await mkdir(OUTPUT, { recursive: true });
  const generatedAt = payload.generatedAt;
  await Promise.all([
    writeFile(path.join(OUTPUT, "summary.json"), `${JSON.stringify(payload, null, 2)}\n`),
    writeFile(path.join(OUTPUT, "components.json"), `${JSON.stringify({
      generatedAt,
      coverage: {
        firstDate: componentRows[0]?.date ?? null,
        lastDate: componentRows.at(-1)?.date ?? null,
        observations: componentRows.length,
      },
      rows: componentRows,
    })}\n`),
    writeFile(path.join(OUTPUT, "daily.json"), `${JSON.stringify({
      generatedAt,
      methodology: "恒指为日收盘；恒指标准分使用约36个月（756个交易日）滚动窗口；合成值仅在对应发布月的最后一个恒指交易日落点。",
      coverage: {
        firstDate: dailyPoints[0]?.date ?? null,
        lastDate: dailyPoints.at(-1)?.date ?? null,
        observations: dailyPoints.length,
      },
      points: dailyPoints,
    })}\n`),
    writeFile(path.join(OUTPUT, "source-cache.json"), `${JSON.stringify({
      generatedAt: payload.generatedAt,
      hkM2YoY: [...hkM2.yoy].map(([date, value]) => ({ date, value: round(value) })),
    }, null, 2)}\n`),
    writeFile(path.join(OUTPUT, "components.csv"), toCsv(componentRows, [
      "date",
      "hkM2YoY",
      "chinaPpiYoY",
      "chinaRetailYoY",
      "tsfMonthlyFlow100m",
      "creditSixMonthFlow100m",
      "nominalGdpTwoQuarter100m",
      "creditRawRatioPctGdp",
      "creditFlowIntensityPctGdp",
    ])),
    writeFile(path.join(OUTPUT, "monthly.csv"), toCsv(series, [
      "date",
      "hsiClose",
      "composite",
      "hkM2YoY",
      "chinaPpiYoY",
      "chinaRetailYoY",
      "creditImpulse",
      "hkM2Z",
      "chinaPpiZ",
      "chinaRetailZ",
      "creditImpulseZ",
    ])),
  ]);
  console.log(JSON.stringify({
    output: OUTPUT,
    generatedAt: payload.generatedAt,
    coverage: payload.coverage,
    latest: payload.latest,
  }, null, 2));
}

await main();
