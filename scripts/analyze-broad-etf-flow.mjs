import dns from "node:dns";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

dns.setDefaultResultOrder("ipv4first");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "public/data/etf-flow");
const CACHE = path.join(ROOT, ".cache/etf-flow");
const TODAY = new Date().toISOString().slice(0, 10);
const SSE_HISTORY_START = "2012-01-04";
const SZSE_HISTORY_START = "2016-09-22";
const DEFAULT_START_DATE = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);
const RETRY_DELAYS_MS = [0, 1_500, 4_000];
const MAX_CONCURRENCY = 8;
const PRICE_CONCURRENCY = 24;
const FULL_HISTORY = process.argv.includes("--full-history");

function optionValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const START_DATE = optionValue("--start-date", FULL_HISTORY ? SSE_HISTORY_START : DEFAULT_START_DATE);
const END_DATE = optionValue("--end-date", TODAY);
if (!/^\d{4}-\d{2}-\d{2}$/.test(START_DATE) || !/^\d{4}-\d{2}-\d{2}$/.test(END_DATE) || START_DATE > END_DATE) {
  throw new Error("Expected --start-date and --end-date as an ordered YYYY-MM-DD range");
}
const DETAIL_DAYS = Number(optionValue("--detail-days", "45"));
if (!Number.isInteger(DETAIL_DAYS) || DETAIL_DAYS < 2) throw new Error("Expected --detail-days to be an integer >= 2");
const DETAIL_START_DATE = formatDate(new Date(new Date(`${END_DATE}T00:00:00Z`).getTime() - DETAIL_DAYS * 86_400_000));

const CLASSIFICATION_RULES = [
  { id: "csi-a500", label: "中证A500", patterns: [/中证A500/i, /A500ETF/i, /^A500/i] },
  { id: "csi-a50", label: "A50系列", patterns: [/中证A50/i, /MSCI中国A50/i, /富时中国A50/i, /A50ETF/i] },
  { id: "star-composite", label: "科创综指", patterns: [/科创综指/i, /科创综合/i, /综指科创/i] },
  { id: "star-200", label: "科创200", patterns: [/科创板?200/i, /科创200/i] },
  { id: "star-100", label: "科创100", patterns: [/科创板?100/i, /科创100/i] },
  { id: "star-50", label: "科创50", patterns: [/科创板?50/i, /科创50/i] },
  { id: "star-chinext-50", label: "科创创业50", patterns: [/科创创业50/i, /科创创业ETF/i, /双创50/i] },
  { id: "chinext-200", label: "创业板200", patterns: [/创业板?200/i, /创200ETF/i] },
  { id: "chinext-50", label: "创业板50", patterns: [/创业板?50/i, /创50ETF/i] },
  { id: "chinext-composite", label: "创业板综指", patterns: [/创业板综/i, /创业综指/i] },
  { id: "chinext", label: "创业板指", patterns: [/创业板ETF/i, /创业板指/i, /^创业板$/i, /创指ETF/i] },
  { id: "csi-2000", label: "中证/国证2000", patterns: [/中证2000/i, /国证2000/i, /2000ETF/i] },
  { id: "csi-1000", label: "中证1000", patterns: [/中证1000/i, /1000ETF/i] },
  { id: "csi-800", label: "中证800", patterns: [/中证800/i, /800ETF/i] },
  { id: "csi-500", label: "中证500", patterns: [/中证500/i, /^500ETF/i, /ZZ500ETF/i] },
  { id: "csi-300", label: "沪深300", patterns: [/沪深300/i, /^300ETF/i, /HS300ETF/i, /^(?:华夏|工银|广发|兴业|国寿|平安)300$/i, /^300中金$/i] },
  { id: "sse-380", label: "上证380", patterns: [/上证380/i, /380ETF/i] },
  { id: "sse-180", label: "上证180", patterns: [/上证180/i, /180ETF/i] },
  { id: "sse-50", label: "上证50", patterns: [/上证50/i, /^50ETF/i, /SZ50ETF/i] },
  { id: "sse-composite", label: "上证综指", patterns: [/上证综指/i, /上证指数ETF/i, /^上证指$/i, /综指ETF/i] },
  { id: "sse-super-large", label: "上证超大盘", patterns: [/上证超大/i, /^超大ETF/i] },
  { id: "mid-cap", label: "中盘指数", patterns: [/^中盘ETF/i] },
  { id: "szse-300", label: "深证300", patterns: [/深证300/i, /深300ETF/i] },
  { id: "szse-100", label: "深证100", patterns: [/深证100/i, /深100ETF/i] },
  { id: "szse-50", label: "深证50", patterns: [/深证50/i, /深50ETF/i] },
  { id: "szse-component", label: "深证成指", patterns: [/深证成指/i, /深成ETF/i] },
  { id: "sme-100", label: "中小100", patterns: [/中小100/i, /中小板ETF/i] },
  { id: "bse-50", label: "北证50", patterns: [/北证50/i] },
];

const BENCHMARK_INDEXES = [
  { id: "csi-a500", label: "中证A500", symbol: "sh000510" },
  { id: "star-composite", label: "科创综指", symbol: "sh000680" },
  { id: "star-200", label: "科创200", symbol: "sh000699" },
  { id: "star-100", label: "科创100", symbol: "sh000698" },
  { id: "star-50", label: "科创50", symbol: "sh000688" },
  { id: "chinext-200", label: "创业板200", symbol: "sz399019" },
  { id: "chinext-50", label: "创业板50", symbol: "sz399673" },
  { id: "chinext-composite", label: "创业板综指", symbol: "sz399102" },
  { id: "chinext", label: "创业板指", symbol: "sz399006" },
  { id: "csi-1000", label: "中证1000", symbol: "sh000852" },
  { id: "csi-800", label: "中证800", symbol: "sh000906" },
  { id: "csi-500", label: "中证500", symbol: "sh000905" },
  { id: "csi-300", label: "沪深300", symbol: "sh000300" },
  { id: "sse-380", label: "上证380", symbol: "sh000009" },
  { id: "sse-180", label: "上证180", symbol: "sh000010" },
  { id: "sse-50", label: "上证50", symbol: "sh000016" },
  { id: "sse-composite", label: "上证指数", symbol: "sh000001" },
  { id: "sse-super-large", label: "上证超大盘", symbol: "sh000043" },
  { id: "mid-cap", label: "上证中盘", symbol: "sh000044" },
  { id: "szse-300", label: "深证300", symbol: "sz399007" },
  { id: "szse-100", label: "深证100", symbol: "sz399330" },
  { id: "szse-50", label: "深证50", symbol: "sz399850" },
  { id: "szse-component", label: "深证成指", symbol: "sz399001" },
  { id: "sme-100", label: "中小100", symbol: "sz399005" },
  { id: "bse-50", label: "北证50", symbol: "bj899050" },
];

const EXCLUDED_STYLES = /增强|指增|增指|红利|低波|价值|成长|质量|自由现金流|等权|基本面|策略|ESG|央企|国企|民企|行业|主题|精选|优选|领先|龙头|标普|纳斯达克|纳指|日经|德国|法国|印度|巴西|香港|港股|沪港深|跨境/;
const ETF_CATEGORIES = [
  { id: "all-a", label: "全A", description: "A股宽基、行业主题与策略ETF的父集合" },
  { id: "broad", label: "宽基", description: "跟踪A股主要宽基指数" },
  { id: "industry", label: "行业", description: "A股行业与主题ETF" },
  { id: "gold", label: "黄金", description: "跟踪黄金现货或黄金商品价格" },
  { id: "hong-kong", label: "港股", description: "跟踪香港市场或港股通标的" },
  { id: "strategy", label: "策略", description: "红利、低波、价值、成长、增强等A股策略" },
  { id: "overseas", label: "海外", description: "港股以外的跨境与海外市场ETF" },
  { id: "bond", label: "债券", description: "国债、信用债、可转债与其他债券ETF" },
  { id: "commodity-other", label: "其他商品", description: "黄金以外的商品ETF" },
  { id: "currency", label: "货币", description: "场内货币与现金管理ETF" },
  { id: "unclassified", label: "待分类", description: "名称不足以可靠识别的ETF" },
];

const ETF_CATEGORY_OVERRIDES = new Map([
  ["513350", "overseas"],
]);

const GOLD_PRODUCT = /黄金ETF|黄金基金|上海金|金ETF|黄金9999|工银黄金|中银黄金/i;
const GOLD_EQUITY = /黄金股|黄金产业|金矿|贵金属股/i;
const HONG_KONG_MARKET = /恒生|恒指|恒科|H股|港股|香港|沪港深|港股通|中港|大湾区|港红利|港高股息|^港(?:科|信息|医疗|互联网|创新药)/i;
const OVERSEAS_MARKET = /纳斯达克|纳指|标普|道琼斯|日经|德国|法国|印度|巴西|沙特|越南|日本|韩国|美国|东南亚|新加坡|海外|全球|中概|QDII|跨境/i;
const CURRENCY_FUND = /货币|现金基金|中银现金|添益|保证金|快线|快钱|场内货币/i;
const BOND_FUND = /债|科创AAA|同业存单|短融/i;
const OTHER_COMMODITY = /豆粕|原油|白银|能源化工|有色金属期货|商品ETF|商品基金|铜ETF|铝ETF/i;
const A_SHARE_STRATEGY = /增强|指增|增指|红利|低波|价值|成长|质量|现金流|(?:300|500|800|全指)现金|现金(?:全指|自由|800)|等权|基本面|治理|策略|ESG|央企|国企|民企|高股息/i;

function round(value, digits = 4) {
  return value == null || !Number.isFinite(value) ? null : +value.toFixed(digits);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function laterDate(left, right) {
  return left > right ? left : right;
}

function dateChunks(startDate, endDate) {
  const chunks = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const finalDate = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= finalDate) {
    const afterChunk = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 3, 1));
    const chunkEnd = new Date(Math.min(finalDate.getTime(), afterChunk.getTime() - 86_400_000));
    chunks.push([formatDate(cursor), formatDate(chunkEnd)]);
    cursor = new Date(chunkEnd.getTime() + 86_400_000);
  }
  return chunks;
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

async function readCachedJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function tradingDates(startDate, endDate) {
  const calendarPath = path.join(ROOT, "public/data/deviation-analysis/daily/shanghai-composite.csv");
  try {
    const dates = (await readFile(calendarPath, "utf8"))
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= startDate && date <= endDate);
    if (dates.length) return dates;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  const dates = [];
  for (let date = new Date(`${startDate}T00:00:00Z`), end = new Date(`${endDate}T00:00:00Z`); date <= end; date = new Date(date.getTime() + 86_400_000)) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) dates.push(formatDate(date));
  }
  return dates;
}

function classifyBroadEtf(name) {
  const normalized = String(name ?? "").replaceAll(" ", "");
  if (EXCLUDED_STYLES.test(normalized)) return null;
  return CLASSIFICATION_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(normalized))) ?? null;
}

function classifyEtf(name, code) {
  const normalized = String(name ?? "").replaceAll(" ", "");
  const benchmark = classifyBroadEtf(normalized);
  let primaryCategoryId = ETF_CATEGORY_OVERRIDES.get(String(code ?? ""));
  if (!primaryCategoryId && !normalized) primaryCategoryId = "unclassified";
  else if (!primaryCategoryId && GOLD_PRODUCT.test(normalized) && !GOLD_EQUITY.test(normalized)) primaryCategoryId = "gold";
  else if (!primaryCategoryId && HONG_KONG_MARKET.test(normalized)) primaryCategoryId = "hong-kong";
  else if (!primaryCategoryId && OVERSEAS_MARKET.test(normalized)) primaryCategoryId = "overseas";
  else if (!primaryCategoryId && CURRENCY_FUND.test(normalized)) primaryCategoryId = "currency";
  else if (!primaryCategoryId && BOND_FUND.test(normalized)) primaryCategoryId = "bond";
  else if (!primaryCategoryId && OTHER_COMMODITY.test(normalized)) primaryCategoryId = "commodity-other";
  else if (!primaryCategoryId && benchmark) primaryCategoryId = "broad";
  else if (!primaryCategoryId && A_SHARE_STRATEGY.test(normalized)) primaryCategoryId = "strategy";
  else if (!primaryCategoryId) primaryCategoryId = "industry";
  const category = ETF_CATEGORIES.find((item) => item.id === primaryCategoryId);
  const isAShareEquity = ["broad", "industry", "strategy"].includes(primaryCategoryId);
  return {
    primaryCategoryId,
    primaryCategory: category.label,
    categoryIds: isAShareEquity ? ["all-a", primaryCategoryId] : [primaryCategoryId],
    benchmarkId: benchmark?.id ?? null,
    benchmark: benchmark?.label ?? null,
  };
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

async function fetchSseSharesForDate(date) {
  const cacheFile = path.join(CACHE, "shares-sse", `${date}.json`);
  const cached = await readCachedJson(cacheFile);
  if (cached) return cached;
  const parameters = new URLSearchParams({
    isPagination: "true",
    sqlId: "COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L",
    STAT_DATE: date,
    "pageHelp.pageSize": "2000",
    "pageHelp.pageNo": "1",
    "pageHelp.beginPage": "1",
    "pageHelp.cacheSize": "1",
    "pageHelp.endPage": "1",
  });
  const payload = await fetchJson(`https://query.sse.com.cn/commonQuery.do?${parameters}`, {
    headers: { Referer: "https://www.sse.com.cn/assortment/fund/list/etfinfo/scale/", "User-Agent": "Mozilla/5.0 BroadEtfFlow/1.0" },
  });
  const rows = (payload.result ?? []).map((row) => ({
    date: row.STAT_DATE,
    code: row.SEC_CODE,
    name: row.FUND_EXPANSION_ABBR || row.SEC_NAME,
    exchange: "SSE",
    shares: Number(row.TOT_VOL) * 10_000,
  }));
  if (rows.length) {
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, `${JSON.stringify(rows)}\n`);
  }
  return rows;
}

async function fetchSseShares() {
  const startDate = laterDate(START_DATE, SSE_HISTORY_START);
  if (startDate > END_DATE) return [];
  const dates = await tradingDates(startDate, END_DATE);
  let completed = 0;
  return (await mapLimit(dates, MAX_CONCURRENCY, async (date) => {
    const rows = await fetchSseSharesForDate(date);
    completed += 1;
    if (FULL_HISTORY && (completed % 100 === 0 || completed === dates.length)) console.error(`[etf-flow] SSE shares ${completed}/${dates.length}`);
    return rows;
  })).flat();
}

async function fetchSzseChunk(startDate, endDate) {
  const cacheFile = path.join(CACHE, "shares-szse", `${startDate}_${endDate}.xlsx`);
  let buffer;
  try {
    buffer = await readFile(cacheFile);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  const parameters = new URLSearchParams({
    SHOWTYPE: "xlsx",
    CATALOGID: "scsj_fund_jjgm",
    TABKEY: "tab1",
    txtStart: startDate,
    txtEnd: END_DATE,
    jjlb: "ETF",
    random: String(Math.random()),
  });
  parameters.set("txtEnd", endDate);
  if (!buffer) {
    const response = await fetchResponse(`https://www.szse.cn/api/report/ShowReport?${parameters}`, {
      headers: { Referer: "https://www.szse.cn/market/fund/volume/etf/index.html", "User-Agent": "Mozilla/5.0 BroadEtfFlow/1.0" },
    });
    buffer = Buffer.from(await response.arrayBuffer());
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, buffer);
  }
  const rows = parseXlsx(buffer);
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

async function fetchSzseShares() {
  const startDate = laterDate(START_DATE, SZSE_HISTORY_START);
  if (startDate > END_DATE) return [];
  const chunks = dateChunks(startDate, END_DATE);
  let completed = 0;
  return (await mapLimit(chunks, 2, async ([chunkStart, chunkEnd]) => {
    const rows = await fetchSzseChunk(chunkStart, chunkEnd);
    completed += 1;
    if (FULL_HISTORY && (completed % 5 === 0 || completed === chunks.length)) console.error(`[etf-flow] SZSE shares ${completed}/${chunks.length}`);
    return rows;
  })).flat();
}

async function fetchPriceHistory(fund, startDate, endDate) {
  const cacheFile = path.join(CACHE, "prices", `${fund.exchange}-${fund.code}.json`);
  const cached = await readCachedJson(cacheFile);
  if (cached?.startDate <= startDate && cached?.endDate >= endDate) {
    return new Map(cached.prices);
  }
  if (fund.exchange === "SSE") {
    const parameters = new URLSearchParams({ select: "date,close", begin: "-10000", end: "-1" });
    const payload = await fetchJson(`https://yunhq.sse.com.cn:32042/v1/sh1/dayk/${fund.code}?${parameters}`, {
      headers: { Referer: "https://www.sse.com.cn/", "User-Agent": "Mozilla/5.0 EtfFlow/1.0" },
    });
    const prices = (payload.kline ?? []).map(([date, close]) => {
      const text = String(date);
      return [`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`, Number(close)];
    });
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, `${JSON.stringify({ startDate, endDate, prices })}\n`);
    return new Map(prices);
  }
  const pricesByDate = new Map();
  let cursorEnd = endDate;
  for (let page = 0; page < 20; page += 1) {
    const parameters = new URLSearchParams({ param: `sz${fund.code},day,${startDate},${cursorEnd},640` });
    const payload = await fetchJson(`https://web.ifzq.gtimg.cn/appstock/app/kline/kline?${parameters}`, {
      headers: { Referer: "https://gu.qq.com/", "User-Agent": "Mozilla/5.0 EtfFlow/1.0" },
    });
    const rows = payload.data?.[`sz${fund.code}`]?.day ?? [];
    for (const row of rows) pricesByDate.set(row[0], Number(row[2]));
    const firstDate = rows[0]?.[0];
    if (!firstDate || firstDate <= startDate || rows.length < 640) break;
    cursorEnd = formatDate(new Date(new Date(`${firstDate}T00:00:00Z`).getTime() - 86_400_000));
  }
  const prices = [...pricesByDate.entries()].sort(([left], [right]) => left.localeCompare(right));
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, `${JSON.stringify({ startDate, endDate, prices })}\n`);
  return new Map(prices);
}

async function fetchTencentDailySeries(symbol, startDate, endDate) {
  const pointsByDate = new Map();
  let cursorEnd = endDate;
  for (let page = 0; page < 20; page += 1) {
    const parameters = new URLSearchParams({ param: `${symbol},day,${startDate},${cursorEnd},640` });
    const payload = await fetchJson(`https://web.ifzq.gtimg.cn/appstock/app/kline/kline?${parameters}`, {
      headers: { Referer: "https://gu.qq.com/", "User-Agent": "Mozilla/5.0 EtfFlow/1.0" },
    });
    const rows = payload.data?.[symbol]?.day ?? [];
    for (const row of rows) pointsByDate.set(row[0], Number(row[2]));
    const firstDate = rows[0]?.[0];
    if (!firstDate || firstDate <= startDate || rows.length < 640) break;
    cursorEnd = formatDate(new Date(new Date(`${firstDate}T00:00:00Z`).getTime() - 86_400_000));
  }
  return [...pointsByDate.entries()].sort(([left], [right]) => left.localeCompare(right));
}

async function fetchBenchmarkIndex(index) {
  const cacheFile = path.join(CACHE, "indices", `${index.id}.json`);
  const outputFile = path.join(OUTPUT, "indices", `${index.id}.json`);
  const cached = await readCachedJson(cacheFile) ?? await readCachedJson(outputFile);
  if (cached?.requestedStartDate <= SSE_HISTORY_START && cached?.requestedEndDate >= END_DATE && cached.points?.length) return cached;
  const fetchStartDate = cached?.requestedStartDate <= SSE_HISTORY_START && cached.points?.length
    ? cached.points.at(-1)[0]
    : SSE_HISTORY_START;
  const freshPoints = await fetchTencentDailySeries(index.symbol, fetchStartDate, END_DATE);
  const points = new Map(cached?.requestedStartDate <= SSE_HISTORY_START ? cached.points : []);
  for (const point of freshPoints) points.set(point[0], point[1]);
  const payload = {
    id: index.id,
    label: index.label,
    symbol: index.symbol,
    source: "腾讯证券指数日线",
    requestedStartDate: SSE_HISTORY_START,
    requestedEndDate: END_DATE,
    points: [...points.entries()].sort(([left], [right]) => left.localeCompare(right)),
  };
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, `${JSON.stringify(payload)}\n`);
  return payload;
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

function emptyFlowMetrics() {
  return { estimatedNetFlowCny: 0, grossInflowCny: 0, grossOutflowCny: 0, funds: 0, pricedFunds: 0, excludedRecords: 0 };
}

function addFlowMetrics(metrics, row) {
  metrics.funds += 1;
  if (row.status !== "ready") {
    metrics.excludedRecords += 1;
    return;
  }
  metrics.pricedFunds += 1;
  metrics.estimatedNetFlowCny += row.estimatedNetFlowCny;
  if (row.estimatedNetFlowCny > 0) metrics.grossInflowCny += row.estimatedNetFlowCny;
  if (row.estimatedNetFlowCny < 0) metrics.grossOutflowCny += row.estimatedNetFlowCny;
}

function addDailyFlow(dailyStates, row) {
  const state = dailyStates.get(row.date) ?? { date: row.date, exchanges: new Set(), allEtf: emptyFlowMetrics(), categories: new Map(), benchmarks: new Map() };
  state.exchanges.add(row.exchange);
  addFlowMetrics(state.allEtf, row);
  for (const categoryId of row.categoryIds) {
    const metrics = state.categories.get(categoryId) ?? emptyFlowMetrics();
    addFlowMetrics(metrics, row);
    state.categories.set(categoryId, metrics);
  }
  if (row.benchmarkId) {
    const metrics = state.benchmarks.get(row.benchmarkId) ?? { ...emptyFlowMetrics(), id: row.benchmarkId, label: row.benchmark };
    addFlowMetrics(metrics, row);
    state.benchmarks.set(row.benchmarkId, metrics);
  }
  dailyStates.set(row.date, state);
}

function serializeFlowMetrics(metrics) {
  return {
    estimatedNetFlowCny: round(metrics.estimatedNetFlowCny, 0),
    estimatedNetFlowYi: round(metrics.estimatedNetFlowCny / 100_000_000),
    grossInflowYi: round(metrics.grossInflowCny / 100_000_000),
    grossOutflowYi: round(metrics.grossOutflowCny / 100_000_000),
    funds: metrics.funds,
    pricedFunds: metrics.pricedFunds,
    excludedRecords: metrics.excludedRecords,
  };
}

function materializeDaily(dailyStates) {
  return [...dailyStates.values()].sort((left, right) => left.date.localeCompare(right.date)).map((state) => {
    const exchanges = [...state.exchanges].sort();
    const categories = ETF_CATEGORIES.map((category) => {
      const metrics = state.categories.get(category.id);
      return metrics ? { id: category.id, label: category.label, ...serializeFlowMetrics(metrics) } : null;
    }).filter(Boolean);
    const allA = categories.find((category) => category.id === "all-a") ?? { ...serializeFlowMetrics(emptyFlowMetrics()) };
    const benchmarks = [...state.benchmarks.values()]
      .map((benchmark) => ({ id: benchmark.id, label: benchmark.label, estimatedNetFlowYi: round(benchmark.estimatedNetFlowCny / 100_000_000), funds: benchmark.funds }))
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
    return {
      date: state.date,
      status: exchanges.length === 2 ? "complete" : "partial",
      exchanges,
      ...serializeFlowMetrics({
        estimatedNetFlowCny: allA.estimatedNetFlowCny,
        grossInflowCny: allA.grossInflowYi * 100_000_000,
        grossOutflowCny: allA.grossOutflowYi * 100_000_000,
        funds: allA.funds,
        pricedFunds: allA.pricedFunds,
        excludedRecords: allA.excludedRecords,
      }),
      allEtf: serializeFlowMetrics(state.allEtf),
      categories,
      benchmarks,
    };
  });
}

async function mergePreviousDaily(calculatedDaily) {
  if (FULL_HISTORY || !calculatedDaily.length) return calculatedDaily;
  try {
    const existing = JSON.parse(await readFile(path.join(OUTPUT, "broad-etf-flow.json"), "utf8"));
    const firstCalculatedDate = calculatedDaily[0].date;
    const previous = (existing.daily ?? []).filter((row) => row.date < firstCalculatedDate && Array.isArray(row.categories));
    return [...previous, ...calculatedDaily];
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return calculatedDaily;
    throw error;
  }
}

async function mergePreviousUniverse(currentUniverse) {
  if (FULL_HISTORY) return currentUniverse;
  try {
    const previousRows = parseCsv(await readFile(path.join(OUTPUT, "universe.csv"), "utf8"));
    const merged = new Map(previousRows.map((row) => {
      const classification = classifyEtf(row.name, row.code);
      return [`${row.exchange}:${row.code}`, {
        ...row,
        ...classification,
        observations: Number(row.observations),
      }];
    }));
    for (const fund of currentUniverse) {
      const key = `${fund.exchange}:${fund.code}`;
      const previous = merged.get(key);
      merged.set(key, previous ? {
        ...fund,
        firstDate: previous.firstDate < fund.firstDate ? previous.firstDate : fund.firstDate,
        lastDate: previous.lastDate > fund.lastDate ? previous.lastDate : fund.lastDate,
        observations: Math.max(previous.observations, fund.observations),
      } : fund);
    }
    return [...merged.values()];
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return currentUniverse;
    throw error;
  }
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  const priceErrors = [];
  const rebuildFromCache = process.argv.includes("--from-cache");
  let fundRows;
  let universe;
  let calculatedDaily;
  if (rebuildFromCache) {
    const cachedFunds = parseCsv(await readFile(path.join(OUTPUT, "fund-daily.csv"), "utf8"));
    const cachedUniverse = parseCsv(await readFile(path.join(OUTPUT, "universe.csv"), "utf8"));
    fundRows = cachedFunds.flatMap((row) => {
      const classification = classifyEtf(row.name, row.code);
      return [{
        ...row,
        ...classification,
        shares: Number(row.shares),
        shareChange: Number(row.shareChange),
        shareChangePct: Number(row.shareChangePct),
        close: row.close ? Number(row.close) : null,
        estimatedNetFlowCny: row.estimatedNetFlowCny ? Number(row.estimatedNetFlowCny) : null,
      }];
    });
    universe = cachedUniverse.flatMap((row) => {
      const classification = classifyEtf(row.name, row.code);
      return [{ ...row, ...classification, observations: Number(row.observations) }];
    });
    const dailyStates = new Map();
    for (const row of fundRows) addDailyFlow(dailyStates, row);
    calculatedDaily = materializeDaily(dailyStates);
  } else {
    const [sseShareRows, szseShareRows] = await Promise.all([fetchSseShares(), fetchSzseShares()]);
    if (process.argv.includes("--probe-sources")) {
      console.log(JSON.stringify({
        requestedRange: { startDate: START_DATE, endDate: END_DATE },
        sseRows: sseShareRows.length,
        sseDates: [...new Set(sseShareRows.map((row) => row.date))].sort(),
        sseFunds: new Set(sseShareRows.map((row) => row.code)).size,
        szseRows: szseShareRows.length,
        szseDates: [...new Set(szseShareRows.map((row) => row.date))].sort(),
        categoryFunds: Object.fromEntries(ETF_CATEGORIES.map((category) => [
          category.id,
          new Set([...sseShareRows, ...szseShareRows]
            .filter((row) => classifyEtf(row.name, row.code).categoryIds.includes(category.id))
            .map((row) => `${row.exchange}:${row.code}`)).size,
        ])),
        categorySamples: Object.fromEntries(ETF_CATEGORIES.map((category) => [
          category.id,
          [...new Set([...sseShareRows, ...szseShareRows]
            .filter((row) => classifyEtf(row.name, row.code).primaryCategoryId === category.id)
            .map((row) => row.name))].slice(0, 12),
        ])),
      }, null, 2));
      return;
    }
    const sharesByFund = new Map();
    for (const row of [...sseShareRows, ...szseShareRows]) {
      const key = `${row.exchange}:${row.code}`;
      const fund = { code: row.code, name: row.name, exchange: row.exchange };
      const existing = sharesByFund.get(key) ?? { fund, rows: [] };
      existing.rows.push(row);
      existing.fund = fund;
      sharesByFund.set(key, existing);
    }
    const histories = [...sharesByFund.values()].filter((item) => item.rows.length >= 2).map(({ fund, rows }) => {
      const sorted = [...rows].sort((left, right) => left.date.localeCompare(right.date));
      const latestRow = sorted.at(-1);
      return { fund: { ...fund, name: latestRow.name, ...classifyEtf(latestRow.name, latestRow.code) }, rows: sorted };
    });
    const dailyStates = new Map();
    let completedPrices = 0;
    fundRows = (await mapLimit(histories, PRICE_CONCURRENCY, async ({ fund, rows }) => {
      const prices = await fetchPriceHistory(fund, rows[0].date, rows.at(-1).date).catch((error) => {
        priceErrors.push({ code: fund.code, exchange: fund.exchange, reason: error instanceof Error ? error.message : String(error) });
        return new Map();
      });
      const detailRows = [];
      rows.slice(1).forEach((row, index) => {
        const previous = rows[index];
        const shareChange = row.shares - previous.shares;
        const shareChangePct = previous.shares ? shareChange / previous.shares * 100 : null;
        const close = prices.get(row.date) ?? null;
        const possibleAdjustment = Math.abs(shareChangePct ?? 0) >= 50;
        const flowRow = {
          date: row.date,
          code: fund.code,
          name: fund.name,
          exchange: fund.exchange,
          primaryCategoryId: fund.primaryCategoryId,
          primaryCategory: fund.primaryCategory,
          categoryIds: fund.categoryIds,
          benchmarkId: fund.benchmarkId,
          benchmark: fund.benchmark,
          shares: round(row.shares, 0),
          shareChange: round(shareChange, 0),
          shareChangePct: round(shareChangePct),
          close: round(close),
          estimatedNetFlowCny: close == null ? null : round(shareChange * close, 0),
          status: close == null ? "missing_price" : possibleAdjustment ? "possible_share_adjustment" : "ready",
        };
        addDailyFlow(dailyStates, flowRow);
        if (flowRow.date >= DETAIL_START_DATE) detailRows.push(flowRow);
      });
      completedPrices += 1;
      if (FULL_HISTORY && (completedPrices % 100 === 0 || completedPrices === histories.length)) console.error(`[etf-flow] ETF prices ${completedPrices}/${histories.length}`);
      return detailRows;
    })).flat();
    calculatedDaily = materializeDaily(dailyStates);
    universe = histories.map(({ fund, rows }) => ({
      ...fund,
      firstDate: rows[0]?.date ?? null,
      lastDate: rows.at(-1)?.date ?? null,
      observations: rows.length,
    }));
    universe = await mergePreviousUniverse(universe);
  }
  const daily = await mergePreviousDaily(calculatedDaily);
  const latest = [...daily].reverse().find((row) => row.status === "complete");
  const latestDate = latest?.date ?? null;
  const latestFunds = fundRows.filter((row) => row.date === latestDate).sort((left, right) => (right.estimatedNetFlowCny ?? -Infinity) - (left.estimatedNetFlowCny ?? -Infinity));
  universe.sort((left, right) => left.primaryCategory.localeCompare(right.primaryCategory, "zh-CN") || left.code.localeCompare(right.code));
  const latestAllA = latest?.categories.find((category) => category.id === "all-a");
  const quality = {
    latestDate,
    dailyRows: daily.length,
    sseFunds: universe.filter((item) => item.exchange === "SSE").length,
    szseFunds: universe.filter((item) => item.exchange === "SZSE").length,
    allAFunds: latestAllA?.funds ?? 0,
    allAPricedFunds: latestAllA?.pricedFunds ?? 0,
    allAPricedRatio: round((latestAllA?.pricedFunds ?? 0) / Math.max(1, latestAllA?.funds ?? 0)),
    priceErrors: priceErrors.length,
    priceErrorSamples: priceErrors.slice(0, 5),
  };
  if (!latest || daily.length < 2 || quality.sseFunds < 100 || quality.szseFunds < 100 || quality.allAPricedRatio < .9) {
    throw new Error(`ETF flow quality gate failed; existing snapshot was not replaced: ${JSON.stringify(quality)}`);
  }
  const completeDaily = daily.filter((row) => row.status === "complete");
  const categoryDaily = daily.flatMap((row) => row.categories.map((category) => ({ date: row.date, status: row.status, exchanges: row.exchanges.join("|"), ...category })));
  const benchmarkIndexSeries = (await mapLimit(BENCHMARK_INDEXES, 6, async (index) => {
    try {
      return await fetchBenchmarkIndex(index);
    } catch (error) {
      console.error(`[etf-flow] benchmark index unavailable: ${index.id}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  })).filter(Boolean);
  const publishedBenchmarkIndexSeries = benchmarkIndexSeries.filter((series) => series.points.length >= 20);
  const availableBenchmarkIndexes = new Map(publishedBenchmarkIndexSeries.map((series) => [series.id, series]));
  const publishedDaily = daily.map((row) => ({
    date: row.date,
    status: row.status,
    exchanges: row.exchanges,
    estimatedNetFlowCny: row.estimatedNetFlowCny,
    estimatedNetFlowYi: row.estimatedNetFlowYi,
    grossInflowYi: row.grossInflowYi,
    grossOutflowYi: row.grossOutflowYi,
    funds: row.funds,
    pricedFunds: row.pricedFunds,
    excludedRecords: row.excludedRecords,
    categories: row.categories,
    benchmarks: row.benchmarks,
  }));
  const payload = {
    generatedAt: new Date().toISOString(),
    asOf: latestDate,
    coverage: { startDate: daily[0]?.date ?? null, fullMarketStartDate: completeDaily[0]?.date ?? null, endDate: latestDate, tradingDays: daily.length, completeTradingDays: completeDaily.length, partialTradingDays: daily.length - completeDaily.length, fundDetailStartDate: fundRows[0]?.date ?? null, funds: universe.length, sseFunds: universe.filter((item) => item.exchange === "SSE").length, szseFunds: universe.filter((item) => item.exchange === "SZSE").length },
    categories: ETF_CATEGORIES,
    methodology: {
      scope: "All exchange-reported ETFs classified into overlapping parent and primary asset groups; 全A contains broad, industry, and strategy ETFs",
      shareChange: "current exchange-reported shares minus prior reported trading-day shares",
      amount: "share change multiplied by same-day unadjusted ETF close; estimated primary-market net subscription amount",
      sseUnit: "SSE TOT_VOL is reported in 10,000 shares and converted to shares",
      szseUnit: "SZSE 基金规模(份) is used directly as shares",
      anomalyRule: "records with absolute one-day share change >= 50% or missing close are excluded from aggregates and retained in detail",
      caveat: "estimated amount is not exchange cash settlement, turnover, or main-force flow; classification and corporate-action flags require periodic review",
      detailRetention: `published fund-level rows retain the latest ${DETAIL_DAYS} calendar days; daily category aggregates retain the full collected history`,
      rebuildMode: rebuildFromCache ? "reclassified from previously collected fund-level observations" : "live source refresh",
    },
    sources: [
      { name: "上海证券交易所 ETF 基金规模", url: "https://www.sse.com.cn/assortment/fund/list/etfinfo/scale/", field: "TOT_VOL" },
      { name: "深圳证券交易所 基金规模日频", url: "https://www.szse.cn/market/fund/volume/etf/index.html", field: "基金规模(份)" },
      { name: "沪深交易所与腾讯证券 ETF 日线", url: "https://gu.qq.com/", field: "不复权收盘价" },
    ],
    errors: priceErrors,
    daily: publishedDaily,
    latestFunds,
    universe,
  };
  const dashboardPayload = {
    generatedAt: payload.generatedAt,
    asOf: payload.asOf,
    coverage: payload.coverage,
    categories: ETF_CATEGORIES,
    benchmarks: CLASSIFICATION_RULES.map(({ id, label }) => ({
      id,
      label,
      indexAvailable: availableBenchmarkIndexes.has(id),
      indexLabel: availableBenchmarkIndexes.get(id)?.label ?? null,
    })),
    daily: daily.map((row) => ({
      date: row.date,
      status: row.status,
      exchanges: row.exchanges,
      categoryFlows: ETF_CATEGORIES.map((category) => row.categories.find((item) => item.id === category.id)?.estimatedNetFlowYi ?? null),
      benchmarkFlows: CLASSIFICATION_RULES.map((benchmark) => row.benchmarks.find((item) => item.id === benchmark.id)?.estimatedNetFlowYi ?? null),
    })),
    latestCategories: latest.categories,
    latestFunds,
  };
  await Promise.all([
    mkdir(path.join(OUTPUT, "indices"), { recursive: true }),
    writeFile(path.join(OUTPUT, "broad-etf-flow.json"), `${JSON.stringify(payload)}\n`),
    writeFile(path.join(OUTPUT, "etf-flow-dashboard.json"), `${JSON.stringify(dashboardPayload)}\n`),
    ...publishedBenchmarkIndexSeries.map((series) => writeFile(path.join(OUTPUT, "indices", `${series.id}.json`), `${JSON.stringify(series)}\n`)),
    writeFile(path.join(OUTPUT, "daily.csv"), toCsv(daily.map((row) => ({ ...row, exchanges: row.exchanges.join("|") })), ["date", "status", "exchanges", "estimatedNetFlowCny", "estimatedNetFlowYi", "grossInflowYi", "grossOutflowYi", "funds", "pricedFunds", "excludedRecords"])),
    writeFile(path.join(OUTPUT, "category-daily.csv"), toCsv(categoryDaily, ["date", "status", "exchanges", "id", "label", "estimatedNetFlowCny", "estimatedNetFlowYi", "grossInflowYi", "grossOutflowYi", "funds", "pricedFunds", "excludedRecords"])),
    writeFile(path.join(OUTPUT, "fund-daily.csv"), toCsv(fundRows.map((row) => ({ ...row, categoryIds: row.categoryIds.join("|") })), ["date", "code", "name", "exchange", "primaryCategoryId", "primaryCategory", "categoryIds", "benchmarkId", "benchmark", "shares", "shareChange", "shareChangePct", "close", "estimatedNetFlowCny", "status"])),
    writeFile(path.join(OUTPUT, "universe.csv"), toCsv(universe.map((row) => ({ ...row, categoryIds: row.categoryIds.join("|") })), ["code", "name", "exchange", "primaryCategoryId", "primaryCategory", "categoryIds", "benchmarkId", "benchmark", "firstDate", "lastDate", "observations"])),
  ]);
  console.log(JSON.stringify({ output: OUTPUT, coverage: payload.coverage, latest: latest ? { date: latest.date, estimatedNetFlowYi: latest.estimatedNetFlowYi, grossInflowYi: latest.grossInflowYi, grossOutflowYi: latest.grossOutflowYi, funds: latest.funds, pricedFunds: latest.pricedFunds, excludedRecords: latest.excludedRecords } : null, priceErrors: priceErrors.length, topInflows: latestFunds.slice(0, 5).map((row) => ({ code: row.code, name: row.name, flowYi: round(row.estimatedNetFlowCny / 100_000_000) })), topOutflows: latestFunds.slice(-5).reverse().map((row) => ({ code: row.code, name: row.name, flowYi: round(row.estimatedNetFlowCny / 100_000_000) })) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
