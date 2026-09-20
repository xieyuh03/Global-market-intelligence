import dns from "node:dns";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

dns.setDefaultResultOrder("ipv4first");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "public/data/etf-flow");
const TODAY = new Date().toISOString().slice(0, 10);
const START_DATE = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);
const RETRY_DELAYS_MS = [0, 1_500, 4_000];
const MAX_CONCURRENCY = 8;

const CLASSIFICATION_RULES = [
  { id: "csi-a500", label: "中证A500", patterns: [/中证A500/i, /A500ETF/i, /^A500/i] },
  { id: "csi-a50", label: "A50系列", patterns: [/中证A50/i, /MSCI中国A50/i, /富时中国A50/i, /A50ETF/i] },
  { id: "star-composite", label: "科创综指", patterns: [/科创综指/i, /科创综合/i] },
  { id: "star-200", label: "科创200", patterns: [/科创板?200/i, /科创200/i] },
  { id: "star-100", label: "科创100", patterns: [/科创板?100/i, /科创100/i] },
  { id: "star-50", label: "科创50", patterns: [/科创板?50/i, /科创50/i] },
  { id: "star-chinext-50", label: "科创创业50", patterns: [/科创创业50/i, /科创创业ETF/i, /双创50/i] },
  { id: "chinext-200", label: "创业板200", patterns: [/创业板?200/i, /创200ETF/i] },
  { id: "chinext-50", label: "创业板50", patterns: [/创业板?50/i, /创50ETF/i] },
  { id: "chinext", label: "创业板指", patterns: [/创业板ETF/i, /创业板指/i, /^创业板$/i, /创指ETF/i] },
  { id: "csi-2000", label: "中证/国证2000", patterns: [/中证2000/i, /国证2000/i, /2000ETF/i] },
  { id: "csi-1000", label: "中证1000", patterns: [/中证1000/i, /1000ETF/i] },
  { id: "csi-800", label: "中证800", patterns: [/中证800/i, /800ETF/i] },
  { id: "csi-500", label: "中证500", patterns: [/中证500/i] },
  { id: "csi-300", label: "沪深300", patterns: [/沪深300/i] },
  { id: "sse-380", label: "上证380", patterns: [/上证380/i, /380ETF/i] },
  { id: "sse-180", label: "上证180", patterns: [/上证180/i, /180ETF/i] },
  { id: "sse-50", label: "上证50", patterns: [/上证50/i, /^50ETF/i] },
  { id: "sse-composite", label: "上证综指", patterns: [/上证综指/i, /上证指数ETF/i] },
  { id: "szse-300", label: "深证300", patterns: [/深证300/i, /深300ETF/i] },
  { id: "szse-100", label: "深证100", patterns: [/深证100/i, /深100ETF/i] },
  { id: "szse-50", label: "深证50", patterns: [/深证50/i, /深50ETF/i] },
  { id: "szse-component", label: "深证成指", patterns: [/深证成指/i, /深成ETF/i] },
  { id: "sme-100", label: "中小100", patterns: [/中小100/i, /中小板ETF/i] },
  { id: "bse-50", label: "北证50", patterns: [/北证50/i] },
];

const EXCLUDED_STYLES = /增强|指增|红利|低波|价值|成长|质量|自由现金流|等权|基本面|策略|ESG|央企|国企|民企|行业|主题|精选|优选|领先|龙头|标普|纳斯达克|纳指|日经|德国|法国|印度|巴西|香港|港股|沪港深|跨境/;
const SSE_CANDIDATE = /A500|A50|科创|创业|双创|2000|1000|800|500ETF|300ETF|380ETF|180ETF|50ETF|上证|深证|深成|中小100|北证50/i;

function round(value, digits = 4) {
  return value == null || !Number.isFinite(value) ? null : +value.toFixed(digits);
}

function compactDate(date) {
  return date.replaceAll("-", "");
}

function xmlDecode(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function excelDate(value) {
  const date = new Date(Date.UTC(1899, 11, 30) + Number(value) * 86_400_000);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

function columnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? "A";
  return [...letters].reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0) - 1;
}

function parseSharedStrings(xml) {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((part) => xmlDecode(part[1])).join(""),
  );
}

function parseWorksheet(xml, sharedStrings) {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const reference = attributes.match(/\br="([A-Z]+\d+)"/)?.[1] ?? "A1";
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? "n";
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        ?? body.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1]
        ?? "";
      row[columnIndex(reference)] = type === "s" ? sharedStrings[Number(raw)] : xmlDecode(raw);
    }
    return row;
  });
}

function zipEntries(buffer) {
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("XLSX end-of-directory record not found");
  const entries = new Map();
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid XLSX central directory");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buffer, entry) {
  if (buffer.readUInt32LE(entry.localOffset) !== 0x04034b50) throw new Error("Invalid XLSX local file header");
  const fileNameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new Error(`Unsupported XLSX compression method ${entry.method}`);
}

function parseXlsx(buffer) {
  const entries = zipEntries(buffer);
  const worksheetName = [...entries.keys()].find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry));
  if (!worksheetName) throw new Error("SZSE workbook has no worksheet");
  const sharedEntry = entries.get("xl/sharedStrings.xml");
  const sharedStrings = sharedEntry ? parseSharedStrings(readZipEntry(buffer, sharedEntry).toString("utf8")) : [];
  const worksheetXml = readZipEntry(buffer, entries.get(worksheetName)).toString("utf8");
  return parseWorksheet(worksheetXml, sharedStrings);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchResponse(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (RETRY_DELAYS_MS[attempt]) await wait(RETRY_DELAYS_MS[attempt]);
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}: ${url}`);
        if (!(response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) || attempt === RETRY_DELAYS_MS.length - 1) throw error;
        lastError = error;
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length - 1) throw error;
    }
  }
  throw lastError;
}

async function fetchJson(url, options = {}) {
  const response = await fetchResponse(url, options);
  const text = await response.text();
  return JSON.parse(text.replace(/^\s*\(/, "").replace(/\)\s*$/, ""));
}

function classifyBroadEtf(name) {
  const normalized = String(name ?? "").replaceAll(" ", "");
  if (EXCLUDED_STYLES.test(normalized)) return null;
  return CLASSIFICATION_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(normalized))) ?? null;
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

async function fetchSseUniverse() {
  const url = "https://yunhq.sse.com.cn:32042/v1/sh1/list/exchange/ebs?select=code,name";
  const payload = await fetchJson(url, { headers: { Referer: "https://www.sse.com.cn/", "User-Agent": "Mozilla/5.0 BroadEtfFlow/1.0" } });
  return (payload.list ?? []).map(([code, name]) => ({ code, name, exchange: "SSE" }));
}

async function fetchSseShares(fund) {
  const parameters = new URLSearchParams({
    isPagination: "true",
    sqlId: "COMMON_SSE_ZQPZ_ETFZL_ETFJBXX_JJGM_MOREN_L",
    SEC_CODE: fund.code,
    "pageHelp.pageSize": "20",
  });
  const payload = await fetchJson(`https://query.sse.com.cn/commonQuery.do?${parameters}`, {
    headers: { Referer: `https://www.sse.com.cn/assortment/fund/list/etfinfo/scale/?FUNDID=${fund.code}`, "User-Agent": "Mozilla/5.0 BroadEtfFlow/1.0" },
  });
  return (payload.result ?? []).map((row) => ({
    date: row.STAT_DATE,
    code: row.SEC_CODE,
    name: row.FUND_EXPANSION_ABBR || row.SEC_NAME || fund.name,
    exchange: "SSE",
    shares: Number(row.TOT_VOL) * 10_000,
  }));
}

async function fetchSzseShares() {
  const parameters = new URLSearchParams({
    SHOWTYPE: "xlsx",
    CATALOGID: "scsj_fund_jjgm",
    TABKEY: "tab1",
    txtStart: START_DATE,
    txtEnd: TODAY,
    jjlb: "ETF",
    random: String(Math.random()),
  });
  const response = await fetchResponse(`https://www.szse.cn/api/report/ShowReport?${parameters}`, {
    headers: { Referer: "https://www.szse.cn/market/fund/volume/etf/index.html", "User-Agent": "Mozilla/5.0 BroadEtfFlow/1.0" },
  });
  const rows = parseXlsx(Buffer.from(await response.arrayBuffer()));
  const headerIndex = rows.findIndex((row) => row.includes("基金代码") && row.some((value) => String(value).includes("基金规模")));
  if (headerIndex < 0) throw new Error("SZSE workbook header not found");
  const headers = rows[headerIndex].map((value) => String(value ?? "").trim());
  const dateIndex = headers.findIndex((value) => value === "日期");
  const codeIndex = headers.findIndex((value) => value === "基金代码");
  const nameIndex = headers.findIndex((value) => value === "基金简称");
  const sharesIndex = headers.findIndex((value) => value.includes("基金规模"));
  return rows.slice(headerIndex + 1).flatMap((row) => {
    const rawCode = String(row[codeIndex] ?? "").replace(/\.0$/, "").padStart(6, "0");
    const rawDate = row[dateIndex];
    const date = /^\d{5}(?:\.\d+)?$/.test(String(rawDate)) ? excelDate(rawDate) : String(rawDate ?? "").slice(0, 10);
    const shares = Number(String(row[sharesIndex] ?? "").replaceAll(",", ""));
    if (!/^\d{6}$/.test(rawCode) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(shares)) return [];
    return [{ date, code: rawCode, name: String(row[nameIndex] ?? ""), exchange: "SZSE", shares }];
  });
}

async function fetchPriceHistory(fund, startDate, endDate) {
  if (fund.exchange === "SSE") {
    const parameters = new URLSearchParams({ select: "date,close", begin: "-30", end: "-1" });
    const payload = await fetchJson(`https://yunhq.sse.com.cn:32042/v1/sh1/dayk/${fund.code}?${parameters}`, {
      headers: { Referer: "https://www.sse.com.cn/", "User-Agent": "Mozilla/5.0 BroadEtfFlow/1.0" },
    });
    return new Map((payload.kline ?? []).map(([date, close]) => {
      const text = String(date);
      return [`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`, Number(close)];
    }));
  }
  const secid = `${fund.exchange === "SSE" ? "1" : "0"}.${fund.code}`;
  const parameters = new URLSearchParams({
    secid,
    klt: "101",
    fqt: "0",
    beg: compactDate(startDate),
    end: compactDate(endDate),
    lmt: "1000",
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
  });
  let payload;
  let lastError;
  for (const protocol of ["https", "http"]) {
    try {
      payload = await fetchJson(`${protocol}://push2his.eastmoney.com/api/qt/stock/kline/get?${parameters}`, {
        headers: { Referer: "https://quote.eastmoney.com/", "User-Agent": "Mozilla/5.0 BroadEtfFlow/1.0" },
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!payload) throw lastError;
  return new Map((payload.data?.klines ?? []).map((line) => {
    const [date, , close] = line.split(",");
    return [date, Number(close)];
  }));
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns) {
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")).join("\n")}\n`;
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  const priceErrors = [];
  const rebuildFromCache = process.argv.includes("--from-cache");
  let fundRows;
  let universe;
  if (rebuildFromCache) {
    const cachedFunds = parseCsv(await readFile(path.join(OUTPUT, "fund-daily.csv"), "utf8"));
    const cachedUniverse = parseCsv(await readFile(path.join(OUTPUT, "universe.csv"), "utf8"));
    fundRows = cachedFunds.flatMap((row) => {
      const category = classifyBroadEtf(row.name);
      if (!category) return [];
      return [{
        ...row,
        benchmarkId: category.id,
        benchmark: category.label,
        shares: Number(row.shares),
        shareChange: Number(row.shareChange),
        shareChangePct: Number(row.shareChangePct),
        close: row.close ? Number(row.close) : null,
        estimatedNetFlowCny: row.estimatedNetFlowCny ? Number(row.estimatedNetFlowCny) : null,
      }];
    });
    universe = cachedUniverse.flatMap((row) => {
      const category = classifyBroadEtf(row.name);
      return category ? [{ ...row, benchmarkId: category.id, benchmark: category.label, observations: Number(row.observations) }] : [];
    });
  } else {
    const [sseUniverse, szseShareRows] = await Promise.all([fetchSseUniverse(), fetchSzseShares()]);
    if (process.argv.includes("--probe-sources")) {
      console.log(JSON.stringify({
        sseUniverse: sseUniverse.length,
        sseCandidates: sseUniverse.filter((fund) => SSE_CANDIDATE.test(fund.name)).length,
        szseRows: szseShareRows.length,
        szseDates: [...new Set(szseShareRows.map((row) => row.date))].sort(),
        szseBroadFunds: new Set(szseShareRows.filter((row) => classifyBroadEtf(row.name)).map((row) => row.code)).size,
      }, null, 2));
      return;
    }
    const sseCandidates = sseUniverse.filter((fund) => SSE_CANDIDATE.test(fund.name));
    const sseHistories = (await mapLimit(sseCandidates, MAX_CONCURRENCY, async (fund) => {
      const rows = await fetchSseShares(fund);
      const fullName = rows[0]?.name;
      const category = fullName ? classifyBroadEtf(fullName) : null;
      return category ? { fund: { ...fund, name: fullName, benchmarkId: category.id, benchmark: category.label }, rows } : null;
    })).filter(Boolean);
    const szseByFund = new Map();
    for (const row of szseShareRows) {
      const category = classifyBroadEtf(row.name);
      if (!category) continue;
      const fund = { code: row.code, name: row.name, exchange: "SZSE", benchmarkId: category.id, benchmark: category.label };
      const existing = szseByFund.get(row.code) ?? { fund, rows: [] };
      existing.rows.push(row);
      szseByFund.set(row.code, existing);
    }
    const histories = [...sseHistories, ...szseByFund.values()].filter((item) => item.rows.length >= 2);
    fundRows = (await mapLimit(histories, MAX_CONCURRENCY, async ({ fund, rows }) => {
      const sorted = [...rows].sort((left, right) => left.date.localeCompare(right.date));
      const prices = await fetchPriceHistory(fund, sorted[0].date, sorted.at(-1).date).catch((error) => {
        priceErrors.push({ code: fund.code, exchange: fund.exchange, reason: error instanceof Error ? error.message : String(error) });
        return new Map();
      });
      return sorted.slice(1).map((row, index) => {
        const previous = sorted[index];
        const shareChange = row.shares - previous.shares;
        const shareChangePct = previous.shares ? shareChange / previous.shares * 100 : null;
        const close = prices.get(row.date) ?? null;
        const possibleAdjustment = Math.abs(shareChangePct ?? 0) >= 50;
        return {
          date: row.date,
          code: fund.code,
          name: fund.name,
          exchange: fund.exchange,
          benchmarkId: fund.benchmarkId,
          benchmark: fund.benchmark,
          shares: round(row.shares, 0),
          shareChange: round(shareChange, 0),
          shareChangePct: round(shareChangePct),
          close: round(close),
          estimatedNetFlowCny: close == null ? null : round(shareChange * close, 0),
          status: close == null ? "missing_price" : possibleAdjustment ? "possible_share_adjustment" : "ready",
        };
      });
    })).flat();
    universe = histories.map(({ fund, rows }) => ({
      ...fund,
      firstDate: [...rows].sort((left, right) => left.date.localeCompare(right.date))[0]?.date ?? null,
      lastDate: [...rows].sort((left, right) => left.date.localeCompare(right.date)).at(-1)?.date ?? null,
      observations: rows.length,
    }));
  }
  const dates = [...new Set(fundRows.map((row) => row.date))].sort();
  const allDaily = dates.map((date) => {
    const rows = fundRows.filter((row) => row.date === date);
    const ready = rows.filter((row) => row.status === "ready");
    const net = ready.reduce((sum, row) => sum + row.estimatedNetFlowCny, 0);
    const exchanges = [...new Set(rows.map((row) => row.exchange))].sort();
    return {
      date,
      status: exchanges.length === 2 ? "complete" : "partial",
      exchanges,
      estimatedNetFlowCny: round(net, 0),
      estimatedNetFlowYi: round(net / 100_000_000),
      grossInflowYi: round(ready.filter((row) => row.estimatedNetFlowCny > 0).reduce((sum, row) => sum + row.estimatedNetFlowCny, 0) / 100_000_000),
      grossOutflowYi: round(ready.filter((row) => row.estimatedNetFlowCny < 0).reduce((sum, row) => sum + row.estimatedNetFlowCny, 0) / 100_000_000),
      funds: rows.length,
      pricedFunds: ready.length,
      excludedRecords: rows.length - ready.length,
      benchmarks: CLASSIFICATION_RULES.map((category) => {
        const categoryRows = ready.filter((row) => row.benchmarkId === category.id);
        if (!categoryRows.length) return null;
        return {
          id: category.id,
          label: category.label,
          estimatedNetFlowYi: round(categoryRows.reduce((sum, row) => sum + row.estimatedNetFlowCny, 0) / 100_000_000),
          funds: categoryRows.length,
        };
      }).filter(Boolean),
    };
  });
  const daily = allDaily.filter((row) => row.status === "complete");
  const latestDate = daily.at(-1)?.date ?? null;
  const latestFunds = fundRows.filter((row) => row.date === latestDate).sort((left, right) => (right.estimatedNetFlowCny ?? -Infinity) - (left.estimatedNetFlowCny ?? -Infinity));
  universe.sort((left, right) => left.benchmark.localeCompare(right.benchmark, "zh-CN") || left.code.localeCompare(right.code));
  const latest = daily.at(-1);
  if (!latest || daily.length < 2 || universe.filter((item) => item.exchange === "SSE").length < 20 || universe.filter((item) => item.exchange === "SZSE").length < 20 || latest.pricedFunds / Math.max(1, latest.funds) < .95) {
    throw new Error("Broad ETF flow quality gate failed; existing snapshot was not replaced");
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    asOf: latestDate,
    coverage: { startDate: daily[0]?.date ?? null, endDate: latestDate, tradingDays: daily.length, funds: universe.length, sseFunds: universe.filter((item) => item.exchange === "SSE").length, szseFunds: universe.filter((item) => item.exchange === "SZSE").length, partialDatesExcluded: allDaily.filter((row) => row.status === "partial").map((row) => ({ date: row.date, exchanges: row.exchanges })) },
    methodology: {
      scope: "A-share broad-market ETFs classified by explicit benchmark-name rules",
      shareChange: "current exchange-reported shares minus prior reported trading-day shares",
      amount: "share change multiplied by same-day unadjusted ETF close; estimated primary-market net subscription amount",
      sseUnit: "SSE TOT_VOL is reported in 10,000 shares and converted to shares",
      szseUnit: "SZSE 基金规模(份) is used directly as shares",
      anomalyRule: "records with absolute one-day share change >= 50% or missing close are excluded from aggregates and retained in detail",
      caveat: "estimated amount is not exchange cash settlement, turnover, or main-force flow; classification and corporate-action flags require periodic review",
      rebuildMode: rebuildFromCache ? "reclassified from previously collected fund-level observations" : "live source refresh",
    },
    sources: [
      { name: "上海证券交易所 ETF 基金规模", url: "https://www.sse.com.cn/assortment/fund/list/etfinfo/scale/", field: "TOT_VOL" },
      { name: "深圳证券交易所 基金规模日频", url: "https://www.szse.cn/market/fund/volume/etf/index.html", field: "基金规模(份)" },
      { name: "东方财富 ETF 日线", url: "https://quote.eastmoney.com/", field: "不复权收盘价" },
    ],
    errors: priceErrors,
    daily,
    latestFunds,
    universe,
  };
  await Promise.all([
    writeFile(path.join(OUTPUT, "broad-etf-flow.json"), `${JSON.stringify(payload, null, 2)}\n`),
    writeFile(path.join(OUTPUT, "daily.csv"), toCsv(daily, ["date", "status", "exchanges", "estimatedNetFlowCny", "estimatedNetFlowYi", "grossInflowYi", "grossOutflowYi", "funds", "pricedFunds", "excludedRecords"])),
    writeFile(path.join(OUTPUT, "fund-daily.csv"), toCsv(fundRows, ["date", "code", "name", "exchange", "benchmarkId", "benchmark", "shares", "shareChange", "shareChangePct", "close", "estimatedNetFlowCny", "status"])),
    writeFile(path.join(OUTPUT, "universe.csv"), toCsv(universe, ["code", "name", "exchange", "benchmarkId", "benchmark", "firstDate", "lastDate", "observations"])),
  ]);
  console.log(JSON.stringify({ output: OUTPUT, coverage: payload.coverage, latest: latest ? { date: latest.date, estimatedNetFlowYi: latest.estimatedNetFlowYi, grossInflowYi: latest.grossInflowYi, grossOutflowYi: latest.grossOutflowYi, funds: latest.funds, pricedFunds: latest.pricedFunds, excludedRecords: latest.excludedRecords } : null, priceErrors: priceErrors.length, topInflows: latestFunds.slice(0, 5).map((row) => ({ code: row.code, name: row.name, flowYi: round(row.estimatedNetFlowCny / 100_000_000) })), topOutflows: latestFunds.slice(-5).reverse().map((row) => ({ code: row.code, name: row.name, flowYi: round(row.estimatedNetFlowCny / 100_000_000) })) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
