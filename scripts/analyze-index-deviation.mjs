import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "public/data/volatility-analysis/raw");
const OUTPUT = path.join(ROOT, "public/data/deviation-analysis");
const DAILY_DIR = path.join(OUTPUT, "daily");
const SERIES_DIR = path.join(OUTPUT, "series");
const TAIL_DIR = path.join(OUTPUT, "tail-events");

const INDEXES = [
  { id: "sp500", name: "标普500", market: "美国", source: "Yahoo Finance" },
  { id: "nasdaq-composite", name: "纳斯达克综合指数", market: "美国", source: "Yahoo Finance" },
  { id: "shanghai-composite", name: "上证指数", market: "中国", source: "东方财富" },
  { id: "csi300", name: "沪深300", market: "中国", source: "东方财富" },
];

const SEGMENTS = {
  sp500: [
    { id: "since-1950", label: "1950年以来", start: "1950-01-01" },
    { id: "since-1970", label: "1970年以来", start: "1970-01-01" },
    { id: "since-2000", label: "2000年以来", start: "2000-01-01" },
    { id: "since-2010", label: "2010年以来", start: "2010-01-01" },
  ],
  "nasdaq-composite": [
    { id: "since-1970", label: "1970年以来", start: "1970-01-01" },
    { id: "since-2000", label: "2000年以来", start: "2000-01-01" },
    { id: "since-2010", label: "2010年以来", start: "2010-01-01" },
  ],
  "shanghai-composite": [
    { id: "full-history", label: "全部历史", start: "1990-01-01" },
    { id: "since-2005", label: "2005年以来", start: "2005-01-01" },
    { id: "since-2010", label: "2010年以来", start: "2010-01-01" },
  ],
  csi300: [
    { id: "full-history", label: "全部历史", start: "2005-01-01" },
    { id: "since-2010", label: "2010年以来", start: "2010-01-01" },
  ],
};

const BANDS = [
  { id: "bottom-1", label: "最低1%", side: "bottom", from: 0, to: .01 },
  { id: "bottom-5", label: "低位1–5%", side: "bottom", from: .01, to: .05 },
  { id: "bottom-10", label: "低位5–10%", side: "bottom", from: .05, to: .10 },
  { id: "middle", label: "中间80%", side: "neutral", from: .10, to: .90 },
  { id: "top-10", label: "高位90–95%", side: "top", from: .90, to: .95 },
  { id: "top-5", label: "高位95–99%", side: "top", from: .95, to: .99 },
  { id: "top-1", label: "最高1%", side: "top", from: .99, to: 1 },
];

function round(value, digits = 4) {
  return value == null || !Number.isFinite(value) ? null : +value.toFixed(digits);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function quantile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower + 1] == null ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

function probability(rows, predicate) {
  return rows.length ? rows.filter(predicate).length / rows.length * 100 : null;
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => {
      const value = values[index] ?? "";
      return [header, header === "date" ? value : value === "" ? null : Number(value)];
    }));
  });
}

function futureLogReturn(rows, index, horizon) {
  const future = rows[index + horizon]?.adjustedClose;
  const current = rows[index]?.adjustedClose;
  return future && current ? Math.log(future / current) * 100 : null;
}

function futureExcursion(rows, index, horizon) {
  const current = rows[index]?.adjustedClose;
  const future = rows.slice(index + 1, index + horizon + 1).map((row) => row.adjustedClose).filter(Number.isFinite);
  if (!current || future.length < horizon) return { gain: null, drawdown: null };
  return {
    gain: (Math.max(...future) / current - 1) * 100,
    drawdown: (Math.min(...future) / current - 1) * 100,
  };
}

function deriveSeries(rows) {
  let sum60 = 0;
  let sum200 = 0;
  return rows.map((row, index) => {
    sum60 += row.adjustedClose;
    sum200 += row.adjustedClose;
    if (index >= 60) sum60 -= rows[index - 60].adjustedClose;
    if (index >= 200) sum200 -= rows[index - 200].adjustedClose;
    const ma60 = index >= 59 ? sum60 / 60 : null;
    const ma200 = index >= 199 ? sum200 / 200 : null;
    const excursion = futureExcursion(rows, index, 20);
    return {
      date: row.date,
      close: row.adjustedClose,
      ma60,
      ma200,
      deviation60Pct: ma60 ? Math.log(row.adjustedClose / ma60) * 100 : null,
      deviation200Pct: ma200 ? Math.log(row.adjustedClose / ma200) * 100 : null,
      forwardReturn5Pct: futureLogReturn(rows, index, 5),
      forwardReturn20Pct: futureLogReturn(rows, index, 20),
      forwardReturn60Pct: futureLogReturn(rows, index, 60),
      maxForwardGain20Pct: excursion.gain,
      maxForwardDrawdown20Pct: excursion.drawdown,
    };
  });
}

function bandStats(rows, key, band, lower, upper) {
  const selected = rows.filter((row) => Number.isFinite(row[key])
    && row[key] >= lower
    && (band.to === 1 ? row[key] <= upper : row[key] < upper)
    && Number.isFinite(row.forwardReturn20Pct));
  const available5 = selected.filter((row) => Number.isFinite(row.forwardReturn5Pct));
  const available60 = selected.filter((row) => Number.isFinite(row.forwardReturn60Pct));
  const excursions = selected.filter((row) => Number.isFinite(row.maxForwardGain20Pct) && Number.isFinite(row.maxForwardDrawdown20Pct));
  return {
    id: band.id,
    label: band.label,
    side: band.side,
    lowerPct: round(lower),
    upperPct: round(upper),
    observations: selected.length,
    reboundProbability5dPct: round(probability(available5, (row) => row.forwardReturn5Pct > 0), 2),
    reboundProbability20dPct: round(probability(selected, (row) => row.forwardReturn20Pct > 0), 2),
    reboundProbability60dPct: round(probability(available60, (row) => row.forwardReturn60Pct > 0), 2),
    drawdownProbability5dPct: round(probability(available5, (row) => row.forwardReturn5Pct < 0), 2),
    drawdownProbability20dPct: round(probability(selected, (row) => row.forwardReturn20Pct < 0), 2),
    drawdownProbability60dPct: round(probability(available60, (row) => row.forwardReturn60Pct < 0), 2),
    gain5Within20dProbabilityPct: round(probability(excursions, (row) => row.maxForwardGain20Pct >= 5), 2),
    loss5Within20dProbabilityPct: round(probability(excursions, (row) => row.maxForwardDrawdown20Pct <= -5), 2),
    averageForward5dPct: round(mean(available5.map((row) => row.forwardReturn5Pct))),
    averageForward20dPct: round(mean(selected.map((row) => row.forwardReturn20Pct))),
    averageForward60dPct: round(mean(available60.map((row) => row.forwardReturn60Pct))),
  };
}

function buildWindow(rows, key, currentDeviation) {
  const values = rows.map((row) => row[key]).filter(Number.isFinite);
  const boundaries = [0, .01, .05, .10, .90, .95, .99, 1].map((value) => quantile(values, value));
  const bands = BANDS.map((band, index) => bandStats(rows, key, band, boundaries[index], boundaries[index + 1]));
  const currentPercentile = values.filter((value) => value <= currentDeviation).length / Math.max(1, values.length) * 100;
  const currentBand = bands.find((band) => currentDeviation >= band.lowerPct
    && (band.id === "top-1" ? currentDeviation <= band.upperPct : currentDeviation < band.upperPct));
  return { currentDeviationPct: round(currentDeviation), currentPercentile: round(currentPercentile, 2), currentBandId: currentBand?.id ?? null, bands };
}

function buildSegment(segment, rows, current) {
  const sample = rows.filter((row) => row.date >= segment.start && Number.isFinite(row.deviation200Pct));
  return {
    ...segment,
    actualStart: sample[0]?.date ?? null,
    end: sample.at(-1)?.date ?? null,
    observations: sample.length,
    windows: {
      60: buildWindow(sample, "deviation60Pct", current.deviation60Pct),
      200: buildWindow(sample, "deviation200Pct", current.deviation200Pct),
    },
  };
}

function buildTailEvents(rows, segment) {
  const sample = rows.filter((row) => row.date >= segment.start && Number.isFinite(row.deviation200Pct));
  const thresholds = {
    low60: quantile(sample.map((row) => row.deviation60Pct), .05),
    high60: quantile(sample.map((row) => row.deviation60Pct), .95),
    low200: quantile(sample.map((row) => row.deviation200Pct), .05),
    high200: quantile(sample.map((row) => row.deviation200Pct), .95),
  };
  return sample.flatMap((row) => {
    const signal60 = row.deviation60Pct <= thresholds.low60 ? "bottom" : row.deviation60Pct >= thresholds.high60 ? "top" : "";
    const signal200 = row.deviation200Pct <= thresholds.low200 ? "bottom" : row.deviation200Pct >= thresholds.high200 ? "top" : "";
    return signal60 || signal200 ? [{ ...row, signal60, signal200 }] : [];
  });
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns) {
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvEscape(round(row[column], 6) ?? row[column])).join(",")).join("\n")}\n`;
}

async function main() {
  await Promise.all([DAILY_DIR, SERIES_DIR, TAIL_DIR].map((directory) => mkdir(directory, { recursive: true })));
  const generatedAt = new Date().toISOString();
  const indices = [];
  for (const definition of INDEXES) {
    const rows = parseCsv(await readFile(path.join(SOURCE, `${definition.id}.csv`), "utf8"));
    const derived = deriveSeries(rows);
    const current = [...derived].reverse().find((row) => Number.isFinite(row.deviation200Pct));
    const segments = SEGMENTS[definition.id].map((segment) => buildSegment(segment, derived, current));
    const tailEvents = buildTailEvents(derived, SEGMENTS[definition.id][0]);
    indices.push({
      ...definition,
      firstDate: rows[0].date,
      lastDate: rows.at(-1).date,
      observations: rows.length,
      current: { date: current.date, close: round(current.close), ma60: round(current.ma60), ma200: round(current.ma200), deviation60Pct: round(current.deviation60Pct), deviation200Pct: round(current.deviation200Pct) },
      segments,
      files: { daily: `daily/${definition.id}.csv`, series: `series/${definition.id}.json`, tailEvents: `tail-events/${definition.id}.csv` },
    });
    await writeFile(path.join(DAILY_DIR, `${definition.id}.csv`), toCsv(derived, ["date", "close", "ma60", "ma200", "deviation60Pct", "deviation200Pct", "forwardReturn5Pct", "forwardReturn20Pct", "forwardReturn60Pct", "maxForwardGain20Pct", "maxForwardDrawdown20Pct"]));
    await writeFile(path.join(SERIES_DIR, `${definition.id}.json`), `${JSON.stringify(derived.map((row) => ({ date: row.date, close: round(row.close), deviation60Pct: round(row.deviation60Pct), deviation200Pct: round(row.deviation200Pct) })))}\n`);
    await writeFile(path.join(TAIL_DIR, `${definition.id}.csv`), toCsv(tailEvents, ["date", "close", "deviation60Pct", "signal60", "deviation200Pct", "signal200", "forwardReturn5Pct", "forwardReturn20Pct", "forwardReturn60Pct", "maxForwardGain20Pct", "maxForwardDrawdown20Pct"]));
  }
  const payload = {
    generatedAt,
    methodology: {
      frequency: "one observation per trading-day close",
      movingAverages: "60-day and 200-day arithmetic simple moving averages",
      deviation: "100 * ln(close / moving average)",
      bottomBands: "lowest 1%, 1-5%, and 5-10% of each selected historical segment",
      topBands: "90-95%, 95-99%, and highest 1% of each selected historical segment",
      rebound: "positive forward 5/20/60-trading-day log return",
      drawdown: "negative forward 5/20/60-trading-day log return",
      excursion: "at least +5% rebound or -5% drawdown at a close within the next 20 trading days",
      caveat: "descriptive historical frequencies; overlapping forward windows are not independent observations",
    },
    indices,
  };
  await writeFile(path.join(OUTPUT, "statistics.json"), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(path.join(OUTPUT, "manifest.json"), `${JSON.stringify({ generatedAt, indexCount: indices.length, observations: indices.reduce((sum, item) => sum + item.observations, 0), files: { statistics: "statistics.json", daily: "daily/*.csv", series: "series/*.json", tailEvents: "tail-events/*.csv" } }, null, 2)}\n`);
  console.log(JSON.stringify({ output: OUTPUT, generatedAt, indices: indices.map((item) => ({ id: item.id, observations: item.observations, current: item.current, segments: item.segments.map((segment) => ({ id: segment.id, observations: segment.observations })) })) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
