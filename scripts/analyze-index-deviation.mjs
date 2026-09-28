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
  { id: "lower-25", label: "低位10–25%", side: "neutral", from: .10, to: .25 },
  { id: "lower-half", label: "中低位25–50%", side: "neutral", from: .25, to: .50 },
  { id: "upper-half", label: "中高位50–75%", side: "neutral", from: .50, to: .75 },
  { id: "upper-90", label: "高位75–90%", side: "neutral", from: .75, to: .90 },
  { id: "top-10", label: "高位90–95%", side: "top", from: .90, to: .95 },
  { id: "top-5", label: "高位95–99%", side: "top", from: .95, to: .99 },
  { id: "top-1", label: "最高1%", side: "top", from: .99, to: 1 },
];

const PROBABILITY_HORIZONS = [5, 10, 20];

function round(value, digits = 4) {
  return value == null || !Number.isFinite(value) ? null : +value.toFixed(digits);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function quantile(values, probabilityValue) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probabilityValue;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower + 1] == null ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

function wilsonInterval(successes, observations) {
  if (!observations) return { lowerPct: null, upperPct: null };
  const z = 1.96;
  const rate = successes / observations;
  const denominator = 1 + z ** 2 / observations;
  const center = (rate + z ** 2 / (2 * observations)) / denominator;
  const margin = z * Math.sqrt((rate * (1 - rate) + z ** 2 / (4 * observations)) / observations) / denominator;
  return {
    lowerPct: (center - margin) * 100,
    upperPct: (center + margin) * 100,
  };
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
  let sum120 = 0;
  return rows.map((row, index) => {
    sum60 += row.adjustedClose;
    sum120 += row.adjustedClose;
    if (index >= 60) sum60 -= rows[index - 60].adjustedClose;
    if (index >= 120) sum120 -= rows[index - 120].adjustedClose;
    const ma60 = index >= 59 ? sum60 / 60 : null;
    const ma120 = index >= 119 ? sum120 / 120 : null;
    const excursion = futureExcursion(rows, index, 20);
    return {
      date: row.date,
      close: row.adjustedClose,
      ma60,
      ma120,
      deviation60Pct: ma60 ? Math.log(row.adjustedClose / ma60) * 100 : null,
      deviation120Pct: ma120 ? Math.log(row.adjustedClose / ma120) * 100 : null,
      forwardReturn5Pct: futureLogReturn(rows, index, 5),
      forwardReturn10Pct: futureLogReturn(rows, index, 10),
      forwardReturn20Pct: futureLogReturn(rows, index, 20),
      forwardReturn60Pct: futureLogReturn(rows, index, 60),
      maxForwardGain20Pct: excursion.gain,
      maxForwardDrawdown20Pct: excursion.drawdown,
    };
  });
}

function outcomeStats(rows, horizon) {
  const returnKey = `forwardReturn${horizon}Pct`;
  const available = rows.filter((row) => Number.isFinite(row[returnKey]));
  const upCount = available.filter((row) => row[returnKey] > 0).length;
  const downCount = available.filter((row) => row[returnKey] < 0).length;
  const confidence = wilsonInterval(upCount, available.length);
  return {
    observations: available.length,
    upProbabilityPct: round(available.length ? upCount / available.length * 100 : null, 2),
    downProbabilityPct: round(available.length ? downCount / available.length * 100 : null, 2),
    averageForwardPct: round(mean(available.map((row) => row[returnKey]))),
    upConfidenceLowerPct: round(confidence.lowerPct, 2),
    upConfidenceUpperPct: round(confidence.upperPct, 2),
  };
}

function bandStats(rows, key, band, lower, upper, baselineByHorizon) {
  const selected = rows.filter((row) => Number.isFinite(row[key])
    && row[key] >= lower
    && (band.to === 1 ? row[key] <= upper : row[key] < upper));
  const horizons = Object.fromEntries(PROBABILITY_HORIZONS.map((horizon) => {
    const statistics = outcomeStats(selected, horizon);
    const baseline = baselineByHorizon[horizon];
    const probabilityLiftPct = statistics.upProbabilityPct - baseline.upProbabilityPct;
    const relativeSignal = statistics.upConfidenceLowerPct > baseline.upProbabilityPct
      ? "strong"
      : statistics.upConfidenceUpperPct < baseline.upProbabilityPct
        ? "weak"
        : "neutral";
    return [horizon, {
      ...statistics,
      probabilityLiftPct: round(probabilityLiftPct, 2),
      relativeSignal,
    }];
  }));
  return {
    id: band.id,
    label: band.label,
    side: band.side,
    percentileFrom: band.from * 100,
    percentileTo: band.to * 100,
    lowerPct: round(lower),
    upperPct: round(upper),
    horizons,
  };
}

function buildFixedBandReference(rows, key, segmentStart) {
  const lowerPct = -8;
  const upperPct = 8;
  const sample = rows.filter((row) => row.date >= segmentStart && Number.isFinite(row[key]));
  const values = sample.map((row) => row[key]);
  const lowerEvents = [];
  const upperEvents = [];
  let lastLowerIndex = Number.NEGATIVE_INFINITY;
  let lastUpperIndex = Number.NEGATIVE_INFINITY;
  for (let index = 1; index < sample.length; index += 1) {
    const previous = sample[index - 1];
    const current = sample[index];
    if (previous[key] > lowerPct && current[key] <= lowerPct && index - lastLowerIndex >= 20) {
      lowerEvents.push(current);
      lastLowerIndex = index;
    }
    if (previous[key] < upperPct && current[key] >= upperPct && index - lastUpperIndex >= 20) {
      upperEvents.push(current);
      lastUpperIndex = index;
    }
  }
  return {
    lowerPct,
    upperPct,
    lowerPercentile: round(values.filter((value) => value <= lowerPct).length / Math.max(1, values.length) * 100, 2),
    upperPercentile: round(values.filter((value) => value <= upperPct).length / Math.max(1, values.length) * 100, 2),
    daysBelowLowerPct: round(values.filter((value) => value <= lowerPct).length / Math.max(1, values.length) * 100, 2),
    daysAboveUpperPct: round(values.filter((value) => value >= upperPct).length / Math.max(1, values.length) * 100, 2),
    lowerCrossings: {
      observations: lowerEvents.length,
      horizons: Object.fromEntries(PROBABILITY_HORIZONS.map((horizon) => [horizon, outcomeStats(lowerEvents, horizon)])),
    },
    upperCrossings: {
      observations: upperEvents.length,
      horizons: Object.fromEntries(PROBABILITY_HORIZONS.map((horizon) => [horizon, outcomeStats(upperEvents, horizon)])),
    },
  };
}

function buildWindow(rows, key, currentDeviation, segmentStart) {
  const sample = rows.filter((row) => row.date >= segmentStart && Number.isFinite(row[key]));
  const horizons = Object.fromEntries(PROBABILITY_HORIZONS.map((horizon) => [horizon, outcomeStats(sample, horizon)]));
  const values = sample.map((row) => row[key]);
  const boundaries = [...new Set(BANDS.flatMap((band) => [band.from, band.to]))]
    .sort((left, right) => left - right)
    .map((value) => quantile(values, value));
  const boundaryByPercentile = new Map(
    [...new Set(BANDS.flatMap((band) => [band.from, band.to]))]
      .sort((left, right) => left - right)
      .map((value, index) => [value, boundaries[index]]),
  );
  const bands = BANDS.map((band) => bandStats(
    sample,
    key,
    band,
    boundaryByPercentile.get(band.from),
    boundaryByPercentile.get(band.to),
    horizons,
  ));
  const currentPercentile = values.filter((value) => value <= currentDeviation).length / Math.max(1, values.length) * 100;
  const currentBand = BANDS.find((band) => currentPercentile >= band.from * 100
    && (band.to === 1 ? currentPercentile <= 100 : currentPercentile < band.to * 100));
  return {
    currentDeviationPct: round(currentDeviation),
    currentPercentile: round(currentPercentile, 2),
    currentBandId: currentBand?.id ?? null,
    actualStart: sample[0]?.date ?? null,
    end: sample.at(-1)?.date ?? null,
    observations: sample.length,
    horizons,
    fixedBandReference: buildFixedBandReference(rows, key, segmentStart),
    bands,
  };
}

function buildSegment(segment, rows, current) {
  return {
    ...segment,
    windows: {
      60: buildWindow(rows, "deviation60Pct", current.deviation60Pct, segment.start),
      120: buildWindow(rows, "deviation120Pct", current.deviation120Pct, segment.start),
    },
  };
}

function buildTailEvents(rows, segment) {
  const sample60 = rows.filter((row) => row.date >= segment.start && Number.isFinite(row.deviation60Pct));
  const sample120 = rows.filter((row) => row.date >= segment.start && Number.isFinite(row.deviation120Pct));
  const thresholds = {
    low60: quantile(sample60.map((row) => row.deviation60Pct), .05),
    high60: quantile(sample60.map((row) => row.deviation60Pct), .95),
    low120: quantile(sample120.map((row) => row.deviation120Pct), .05),
    high120: quantile(sample120.map((row) => row.deviation120Pct), .95),
  };
  return rows.filter((row) => row.date >= segment.start).flatMap((row) => {
    const signal60 = row.deviation60Pct <= thresholds.low60 ? "bottom" : row.deviation60Pct >= thresholds.high60 ? "top" : "";
    const signal120 = row.deviation120Pct <= thresholds.low120 ? "bottom" : row.deviation120Pct >= thresholds.high120 ? "top" : "";
    return signal60 || signal120 ? [{ ...row, signal60, signal120 }] : [];
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
    const current = [...derived].reverse().find((row) => Number.isFinite(row.deviation120Pct));
    const segments = SEGMENTS[definition.id].map((segment) => buildSegment(segment, derived, current));
    const tailEvents = buildTailEvents(derived, SEGMENTS[definition.id][0]);
    indices.push({
      ...definition,
      firstDate: rows[0].date,
      lastDate: rows.at(-1).date,
      observations: rows.length,
      current: {
        date: current.date,
        close: round(current.close),
        ma60: round(current.ma60),
        ma120: round(current.ma120),
        deviation60Pct: round(current.deviation60Pct),
        deviation120Pct: round(current.deviation120Pct),
      },
      segments,
      files: {
        daily: `daily/${definition.id}.csv`,
        series: `series/${definition.id}.json`,
        tailEvents: `tail-events/${definition.id}.csv`,
      },
    });
    await writeFile(
      path.join(DAILY_DIR, `${definition.id}.csv`),
      toCsv(derived, ["date", "close", "ma60", "ma120", "deviation60Pct", "deviation120Pct", "forwardReturn5Pct", "forwardReturn10Pct", "forwardReturn20Pct", "forwardReturn60Pct", "maxForwardGain20Pct", "maxForwardDrawdown20Pct"]),
    );
    await writeFile(
      path.join(SERIES_DIR, `${definition.id}.json`),
      `${JSON.stringify(derived.map((row) => ({
        date: row.date,
        close: round(row.close),
        deviation60Pct: round(row.deviation60Pct),
        deviation120Pct: round(row.deviation120Pct),
      })))}\n`,
    );
    await writeFile(
      path.join(TAIL_DIR, `${definition.id}.csv`),
      toCsv(tailEvents, ["date", "close", "deviation60Pct", "signal60", "deviation120Pct", "signal120", "forwardReturn5Pct", "forwardReturn10Pct", "forwardReturn20Pct", "forwardReturn60Pct", "maxForwardGain20Pct", "maxForwardDrawdown20Pct"]),
    );
  }
  const payload = {
    generatedAt,
    methodology: {
      frequency: "one observation per trading-day close",
      movingAverages: "60-day and 120-day arithmetic simple moving averages",
      deviation: "100 * ln(close / moving average)",
      probabilityBands: "0-1%, 1-5%, 5-10%, 10-25%, 25-50%, 50-75%, 75-90%, 90-95%, 95-99%, and 99-100% of each selected historical segment",
      independentWindows: "60-day and 120-day samples, quantile boundaries, and forward probabilities are calculated independently for every index",
      probabilityHorizons: "forward 5/10/20-trading-day log returns",
      baseline: "each interval is compared with the unconditional up probability of the same index, historical segment, deviation window, and forward horizon",
      relativeSignal: "strong or weak only when the interval's 95% Wilson interval is entirely above or below its matching baseline; otherwise neutral",
      fixedBandReference: "entry events at -8% and +8%, de-clustered with a 20-trading-day cooldown; thresholds are visual references rather than universal reversal signals",
      excursion: "at least +5% rebound or -5% drawdown at a close within the next 20 trading days",
      caveat: "descriptive historical frequencies; overlapping forward windows are not independent observations",
    },
    indices,
  };
  await writeFile(path.join(OUTPUT, "statistics.json"), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(
    path.join(OUTPUT, "manifest.json"),
    `${JSON.stringify({
      generatedAt,
      indexCount: indices.length,
      observations: indices.reduce((sum, item) => sum + item.observations, 0),
      files: {
        statistics: "statistics.json",
        daily: "daily/*.csv",
        series: "series/*.json",
        tailEvents: "tail-events/*.csv",
      },
    }, null, 2)}\n`,
  );
  console.log(JSON.stringify({
    output: OUTPUT,
    generatedAt,
    indices: indices.map((item) => ({
      id: item.id,
      observations: item.observations,
      current: item.current,
      segments: item.segments.map((segment) => ({
        id: segment.id,
        windows: Object.fromEntries(Object.entries(segment.windows).map(([window, statistics]) => [
          window,
          { observations: statistics.observations, actualStart: statistics.actualStart },
        ])),
      })),
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
