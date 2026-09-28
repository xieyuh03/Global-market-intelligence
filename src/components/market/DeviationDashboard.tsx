"use client";

import { type PointerEvent as ReactPointerEvent, useDeferredValue, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type WindowDays = "60" | "120";
type ProbabilityHorizon = "5" | "10" | "20";
type RelativeSignal = "strong" | "weak" | "neutral";
type ReferenceMode = "fixed8" | "p10-p90" | "p5-p95";

type OutcomeStatistics = {
  observations: number;
  upProbabilityPct: number;
  downProbabilityPct: number;
  averageForwardPct: number;
  upConfidenceLowerPct: number;
  upConfidenceUpperPct: number;
};

type BandOutcomeStatistics = OutcomeStatistics & {
  probabilityLiftPct: number;
  relativeSignal: RelativeSignal;
};

type ProbabilityBand = {
  id: string;
  label: string;
  side: "bottom" | "neutral" | "top";
  percentileFrom: number;
  percentileTo: number;
  lowerPct: number;
  upperPct: number;
  horizons: Record<ProbabilityHorizon, BandOutcomeStatistics>;
};

type FixedBandCrossings = {
  observations: number;
  horizons: Record<ProbabilityHorizon, OutcomeStatistics>;
};

type FixedBandReference = {
  lowerPct: number;
  upperPct: number;
  lowerPercentile: number;
  upperPercentile: number;
  daysBelowLowerPct: number;
  daysAboveUpperPct: number;
  lowerCrossings: FixedBandCrossings;
  upperCrossings: FixedBandCrossings;
};

type WindowStatistics = {
  currentDeviationPct: number;
  currentPercentile: number;
  currentBandId: string | null;
  actualStart: string;
  end: string;
  observations: number;
  horizons: Record<ProbabilityHorizon, OutcomeStatistics>;
  fixedBandReference: FixedBandReference;
  bands: ProbabilityBand[];
};

type Segment = {
  id: string;
  label: string;
  start: string;
  windows: Record<WindowDays, WindowStatistics>;
};

type IndexStatistics = {
  id: string;
  name: string;
  market: string;
  source: string;
  firstDate: string;
  lastDate: string;
  observations: number;
  current: {
    date: string;
    close: number;
    ma60: number;
    ma120: number;
    deviation60Pct: number;
    deviation120Pct: number;
  };
  segments: Segment[];
};

export type DeviationStatistics = {
  generatedAt: string;
  indices: IndexStatistics[];
};

type SeriesPoint = {
  date: string;
  close: number;
  deviation60Pct: number | null;
  deviation120Pct: number | null;
};

type ReferenceBand = {
  lowerPct: number;
  upperPct: number;
  label: string;
};

const seriesRequests = new Map<string, Promise<SeriesPoint[]>>();

function loadSeries(url: string) {
  const existing = seriesRequests.get(url);
  if (existing) return existing;
  const request = fetch(url).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<SeriesPoint[]>;
  });
  seriesRequests.set(url, request);
  return request;
}

const RANGE_PRESETS = [
  { label: "1年", days: 252 },
  { label: "3年", days: 756 },
  { label: "5年", days: 1_260 },
  { label: "10年", days: 2_520 },
  { label: "全历史", days: Number.POSITIVE_INFINITY },
];

const REFERENCE_OPTIONS: Array<{ id: ReferenceMode; label: string }> = [
  { id: "fixed8", label: "固定 ±8%" },
  { id: "p10-p90", label: "历史 P10 / P90" },
  { id: "p5-p95", label: "历史 P5 / P95" },
];

const RELATIVE_SIGNAL_STYLE: Record<RelativeSignal, { color: string; label: string }> = {
  strong: { color: "#e7685d", label: "明显高于基准" },
  weak: { color: "#55a876", label: "明显低于基准" },
  neutral: { color: "#7f8992", label: "接近基准" },
};

function pct(value: number | null, digits = 2) {
  if (value == null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function probability(value: number | null) {
  return value == null ? "--" : `${value.toFixed(1)}%`;
}

function percentagePoint(value: number | null) {
  if (value == null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}pp`;
}

function rangeLabel(band: ProbabilityBand) {
  return `${pct(band.lowerPct)} 至 ${pct(band.upperPct)}`;
}

function tone(value: number) {
  if (value > 0) return "#e7685d";
  if (value < 0) return "#55a876";
  return "#aab4be";
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function getReferenceBand(window: WindowStatistics, mode: ReferenceMode): ReferenceBand {
  if (mode === "fixed8") {
    return {
      lowerPct: window.fixedBandReference.lowerPct,
      upperPct: window.fixedBandReference.upperPct,
      label: "固定 ±8%",
    };
  }
  if (mode === "p5-p95") {
    const bottom = window.bands.find((band) => band.id === "bottom-5") ?? window.bands[1];
    const top = window.bands.find((band) => band.id === "top-5") ?? window.bands.at(-2)!;
    return { lowerPct: bottom.upperPct, upperPct: top.lowerPct, label: "历史 P5 / P95" };
  }
  const bottom = window.bands.find((band) => band.id === "bottom-10") ?? window.bands[2];
  const top = window.bands.find((band) => band.id === "top-10") ?? window.bands.at(-3)!;
  return { lowerPct: bottom.upperPct, upperPct: top.lowerPct, label: "历史 P10 / P90" };
}

function ProbabilityTable({
  bands,
  currentBandId,
  horizon,
  baseline,
}: {
  bands: ProbabilityBand[];
  currentBandId: string | null;
  horizon: ProbabilityHorizon;
  baseline: OutcomeStatistics;
}) {
  return (
    <div className="overflow-hidden border border-white/10">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-xs">
          <thead className="border-b border-white/10 bg-white/[0.025] text-[10px] text-gray-500">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">历史位置</th>
              <th className="px-3 py-2.5 text-left font-medium">偏离度区间</th>
              <th className="px-3 py-2.5 text-right font-medium">样本</th>
              <th className="px-3 py-2.5 text-right font-medium">{horizon}日上涨</th>
              <th className="px-3 py-2.5 text-right font-medium">{horizon}日下跌</th>
              <th className="px-3 py-2.5 text-right font-medium">上涨概率95%区间</th>
              <th className="px-3 py-2.5 text-right font-medium">相对基准</th>
              <th className="px-3 py-2.5 text-right font-medium">平均收益</th>
              <th className="px-3 py-2.5 text-right font-medium">区间信号</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07]">
            {bands.map((band) => {
              const outcome = band.horizons[horizon];
              const style = RELATIVE_SIGNAL_STYLE[outcome.relativeSignal];
              const isCurrent = band.id === currentBandId;
              return (
                <tr key={band.id} className={isCurrent ? "bg-white/[0.055]" : "hover:bg-white/[0.025]"}>
                  <td className="px-3 py-3 text-gray-300">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2" style={{ background: style.color }} />
                      {band.label}
                      {isCurrent ? <span className="border border-[#d49a54]/40 px-1.5 py-0.5 text-[9px] text-[#d49a54]">当前</span> : null}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-gray-500">{rangeLabel(band)}</td>
                  <td className="px-3 py-3 text-right font-mono text-gray-400">{outcome.observations.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right font-mono text-[#e7685d]">{probability(outcome.upProbabilityPct)}</td>
                  <td className="px-3 py-3 text-right font-mono text-[#55a876]">{probability(outcome.downProbabilityPct)}</td>
                  <td className="px-3 py-3 text-right font-mono text-gray-500">{outcome.upConfidenceLowerPct.toFixed(1)}%–{outcome.upConfidenceUpperPct.toFixed(1)}%</td>
                  <td className="px-3 py-3 text-right font-mono" style={{ color: style.color }}>
                    {percentagePoint(outcome.probabilityLiftPct)}
                    <span className="ml-1 text-[9px] text-gray-600">vs {probability(baseline.upProbabilityPct)}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono" style={{ color: tone(outcome.averageForwardPct) }}>{pct(outcome.averageForwardPct)}</td>
                  <td className="px-3 py-3 text-right font-medium" style={{ color: style.color }}>{style.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProbabilityBandMap({
  bands,
  currentBandId,
  horizon,
}: {
  bands: ProbabilityBand[];
  currentBandId: string | null;
  horizon: ProbabilityHorizon;
}) {
  return (
    <div className="grid gap-px overflow-hidden border border-white/10 bg-white/10 lg:grid-cols-5">
      {bands.map((band) => {
        const outcome = band.horizons[horizon];
        const style = RELATIVE_SIGNAL_STYLE[outcome.relativeSignal];
        const isCurrent = band.id === currentBandId;
        return (
          <div
            key={band.id}
            className="relative min-h-32 bg-[#111619] p-3"
            style={{ boxShadow: isCurrent ? "inset 0 0 0 1px rgba(212,154,84,0.8)" : undefined }}
          >
            <div
              className="absolute inset-x-0 top-0 h-1"
              style={{ background: style.color, opacity: outcome.relativeSignal === "neutral" ? 0.3 : 0.5 + Math.min(0.5, Math.abs(outcome.probabilityLiftPct) / 20) }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-gray-400">{band.label}</span>
              {isCurrent ? <span className="text-[9px] text-[#d49a54]">当前区间</span> : null}
            </div>
            <p className="mt-2 font-mono text-[11px] text-gray-500">{rangeLabel(band)}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div><p className="text-[9px] text-gray-600">{horizon}日上涨</p><p className="mt-1 font-mono text-sm text-[#e7685d]">{probability(outcome.upProbabilityPct)}</p></div>
              <div className="text-right"><p className="text-[9px] text-gray-600">相对基准</p><p className="mt-1 font-mono text-sm" style={{ color: style.color }}>{percentagePoint(outcome.probabilityLiftPct)}</p></div>
            </div>
            <p className="mt-2 text-[9px]" style={{ color: style.color }}>{style.label}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function DeviationDashboard({ data, dataBase }: { data: DeviationStatistics; dataBase: string }) {
  const [indexId, setIndexId] = useState(data.indices[0].id);
  const [segmentId, setSegmentId] = useState(data.indices[0].segments[0].id);
  const [windowDays, setWindowDays] = useState<WindowDays>("60");
  const [probabilityHorizon, setProbabilityHorizon] = useState<ProbabilityHorizon>("5");
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>("fixed8");
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoveredPoint, setHoveredPoint] = useState<SeriesPoint | null>(null);
  const deferredStart = useDeferredValue(startIndex);
  const deferredEnd = useDeferredValue(endIndex);
  const selectedIndex = data.indices.find((item) => item.id === indexId) ?? data.indices[0];
  const selectedSegment = selectedIndex.segments.find((item) => item.id === segmentId) ?? selectedIndex.segments[0];
  const selectedWindow = selectedSegment.windows[windowDays];
  const selectedBaseline = selectedWindow.horizons[probabilityHorizon];
  const fixedBandReference = selectedWindow.fixedBandReference;
  const referenceBand = getReferenceBand(selectedWindow, referenceMode);
  const currentBand = selectedWindow.bands.find((band) => band.id === selectedWindow.currentBandId) ?? null;
  const currentOutcome = currentBand?.horizons[probabilityHorizon] ?? null;
  const currentSignal = currentOutcome?.relativeSignal ?? "neutral";
  const lowerCrossingOutcome = fixedBandReference.lowerCrossings.horizons[probabilityHorizon];
  const upperCrossingOutcome = fixedBandReference.upperCrossings.horizons[probabilityHorizon];
  const deviationDataKey = windowDays === "60" ? "deviation60Pct" : "deviation120Pct";
  const currentDeviation = windowDays === "60" ? selectedIndex.current.deviation60Pct : selectedIndex.current.deviation120Pct;
  const currentMovingAverage = windowDays === "60" ? selectedIndex.current.ma60 : selectedIndex.current.ma120;
  const hoveredDeviation = hoveredPoint?.[deviationDataKey] ?? null;

  useEffect(() => {
    let active = true;
    loadSeries(`${dataBase}/series/${selectedIndex.id}.json`)
      .then((payload) => {
        if (!active) return;
        setError("");
        setSeries(payload);
        setHoveredPoint(payload.at(-1) ?? null);
        setEndIndex(Math.max(0, payload.length - 1));
        setStartIndex(Math.max(0, payload.length - 1 - 2_520));
      })
      .catch(() => {
        if (!active) return;
        setError("偏离度日频序列加载失败，请稍后刷新。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dataBase, selectedIndex]);

  const visibleSeries = series.slice(deferredStart, deferredEnd + 1);
  const startDate = visibleSeries[0]?.date ?? "--";
  const endDate = visibleSeries.at(-1)?.date ?? "--";
  const deviationValues = visibleSeries.map((point) => point[deviationDataKey]).filter((value): value is number => value != null);
  const deviationMin = Math.floor(Math.min(referenceBand.lowerPct, ...deviationValues) - 2);
  const deviationMax = Math.ceil(Math.max(referenceBand.upperPct, ...deviationValues) + 2);

  function applyPreset(days: number) {
    const finalIndex = Math.max(0, series.length - 1);
    setEndIndex(finalIndex);
    setStartIndex(Number.isFinite(days) ? Math.max(0, finalIndex - days) : 0);
  }

  function selectIndex(index: IndexStatistics) {
    setIndexId(index.id);
    setSegmentId(index.segments[0].id);
    setSeries([]);
    setHoveredPoint(null);
    setLoading(true);
    setError("");
  }

  function trackPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!visibleSeries.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotLeft = bounds.left + 56;
    const plotWidth = Math.max(1, bounds.width - 72);
    const ratio = Math.max(0, Math.min(1, (event.clientX - plotLeft) / plotWidth));
    const point = visibleSeries[Math.round(ratio * (visibleSeries.length - 1))];
    if (point) setHoveredPoint(point);
  }

  return (
    <>
      <section className="border border-white/10 bg-[#0d1215]" aria-label="偏离度图表控制">
        <div className="border-b border-white/10 p-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="选择指数">
            {data.indices.map((index) => (
              <button
                key={index.id}
                type="button"
                role="tab"
                aria-selected={indexId === index.id}
                onClick={() => selectIndex(index)}
                className="h-9 border px-3 text-xs transition-colors"
                style={{
                  color: indexId === index.id ? "#f4f5f6" : "#89949e",
                  borderColor: indexId === index.id ? "rgba(212,154,84,0.45)" : "rgba(255,255,255,0.10)",
                  background: indexId === index.id ? "rgba(212,154,84,0.09)" : "transparent",
                }}
              >
                {index.name}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex border border-white/10 p-1" aria-label="选择偏离度周期">
              {(["60", "120"] as const).map((window) => (
                <button
                  key={window}
                  type="button"
                  aria-pressed={windowDays === window}
                  onClick={() => setWindowDays(window)}
                  className="h-8 px-3 text-xs"
                  style={{
                    background: windowDays === window ? "#d49a54" : "transparent",
                    color: windowDays === window ? "#111619" : "#8e99a3",
                  }}
                >
                  {window}日偏离
                </button>
              ))}
            </div>
            <div className="flex border border-white/10 p-1" aria-label="选择参考区间">
              {REFERENCE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={referenceMode === option.id}
                  onClick={() => setReferenceMode(option.id)}
                  className="h-8 px-2.5 text-[11px]"
                  style={{
                    background: referenceMode === option.id ? "rgba(212,154,84,0.18)" : "transparent",
                    color: referenceMode === option.id ? "#e6b878" : "#8e99a3",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1" aria-label="选择图表时间范围">
              {RANGE_PRESETS.map((preset) => (
                <button key={preset.label} type="button" onClick={() => applyPreset(preset.days)} className="h-9 border border-white/10 px-2.5 text-[10px] text-gray-400 hover:bg-white/5">{preset.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-white">{selectedIndex.name} · {windowDays}日均线对数偏离度</h2>
            <p className="mt-1 text-[10px] text-gray-600">{startDate} 至 {endDate} · {referenceBand.label} · 上下图共享时间轴与十字指针</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px]" aria-live="polite" data-testid="deviation-hover-readout">
            <span className="font-mono text-gray-300">{hoveredPoint?.date ?? "--"}</span>
            <span className="text-[#aab7c4]">{selectedIndex.name} {hoveredPoint?.close.toLocaleString("zh-CN") ?? "--"}</span>
            <span className="text-[#d49a54]">{windowDays}日偏离 {pct(hoveredDeviation)}</span>
          </div>
        </div>

        <div onPointerMove={trackPointer} data-testid="linked-deviation-charts">
          {loading ? <div className="grid h-[680px] place-items-center text-xs text-gray-500">加载日频数据…</div> : null}
          {error ? <div className="grid h-[680px] place-items-center text-xs text-red-300">{error}</div> : null}
          {!loading && !error && visibleSeries.length ? (
            <>
              <div className="border-b border-white/10 px-2 pb-2 pt-4 sm:px-4">
                <div className="mb-2 flex items-center justify-between px-2 text-[10px]">
                  <span className="uppercase tracking-[0.18em] text-gray-600">Index</span>
                  <span className="text-gray-400">{selectedIndex.name} {hoveredPoint?.close.toLocaleString("zh-CN") ?? "--"}</span>
                </div>
                <div className="h-[260px]" data-testid="index-chart">
                  <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1200, height: 260 }}>
                    <LineChart data={visibleSeries} syncId="deviation-linked" syncMethod="value" margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.065)" vertical={false} />
                      <XAxis dataKey="date" hide />
                      <YAxis width={52} tick={{ fill: "#7f8992", fontSize: 10 }} tickFormatter={(value) => compactNumber(Number(value))} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                      <ReferenceLine x={hoveredPoint?.date} stroke="rgba(212,154,84,0.72)" strokeWidth={1} />
                      <ReferenceLine y={hoveredPoint?.close} stroke="rgba(212,154,84,0.5)" strokeWidth={1} strokeDasharray="3 4" />
                      <ReferenceDot x={hoveredPoint?.date} y={hoveredPoint?.close} r={3} fill="#d49a54" stroke="#111619" strokeWidth={1} />
                      <Tooltip
                        formatter={(value) => [Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 }), selectedIndex.name]}
                        labelFormatter={(label) => `交易日 ${label}`}
                        cursor={false}
                        contentStyle={{ background: "#111619", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 0, fontSize: 11 }}
                        labelStyle={{ color: "#f2f4f5", marginBottom: 6 }}
                      />
                      <Line type="monotone" dataKey="close" name={selectedIndex.name} stroke="#b6c0ca" strokeWidth={1.6} dot={false} connectNulls isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="px-2 pb-4 pt-3 sm:px-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 text-[10px]">
                  <span className="uppercase tracking-[0.18em] text-gray-600">Log deviation</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-[#e88a82]"><span className="h-2 w-4 bg-[#e7685d]/20" />高于 {pct(referenceBand.upperPct)}</span>
                    <span className="inline-flex items-center gap-1.5 text-[#65b986]"><span className="h-2 w-4 bg-[#55a876]/20" />低于 {pct(referenceBand.lowerPct)}</span>
                    <span className="font-mono text-[#d49a54]">当前 {pct(currentDeviation)}</span>
                  </div>
                </div>
                <div className="h-[360px]" data-testid="deviation-chart">
                  <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1200, height: 360 }}>
                    <LineChart data={visibleSeries} syncId="deviation-linked" syncMethod="value" margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.065)" vertical />
                      <XAxis dataKey="date" minTickGap={70} tick={{ fill: "#7f8992", fontSize: 10 }} tickFormatter={(date) => String(date).slice(0, 7)} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} />
                      <YAxis width={52} domain={[deviationMin, deviationMax]} tick={{ fill: "#7f8992", fontSize: 10 }} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} axisLine={false} tickLine={false} />
                      <ReferenceArea y1={referenceBand.upperPct} y2={deviationMax} fill="#e7685d" fillOpacity={0.1} stroke="none" ifOverflow="hidden" />
                      <ReferenceArea y1={deviationMin} y2={referenceBand.lowerPct} fill="#55a876" fillOpacity={0.1} stroke="none" ifOverflow="hidden" />
                      <ReferenceLine y={referenceBand.upperPct} stroke="#e7685d" strokeOpacity={0.65} strokeDasharray="6 5" />
                      <ReferenceLine y={referenceBand.lowerPct} stroke="#55a876" strokeOpacity={0.65} strokeDasharray="6 5" />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.38)" />
                      <ReferenceLine x={hoveredPoint?.date} stroke="rgba(212,154,84,0.72)" strokeWidth={1} />
                      <ReferenceLine y={hoveredDeviation ?? undefined} stroke="rgba(212,154,84,0.5)" strokeWidth={1} strokeDasharray="3 4" />
                      <ReferenceDot x={hoveredPoint?.date} y={hoveredDeviation ?? undefined} r={3} fill="#d49a54" stroke="#111619" strokeWidth={1} />
                      <Tooltip
                        formatter={(value) => [`${Number(value).toFixed(2)}%`, `${windowDays}日偏离度`]}
                        labelFormatter={(label) => `交易日 ${label}`}
                        cursor={false}
                        contentStyle={{ background: "#111619", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 0, fontSize: 11 }}
                        labelStyle={{ color: "#f2f4f5", marginBottom: 6 }}
                      />
                      <Line type="monotone" dataKey={deviationDataKey} name={`${windowDays}日偏离度`} stroke="#d49a54" strokeWidth={1.8} dot={false} connectNulls isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>

      <details className="mt-5 border border-white/10 bg-[#0d1215]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-sm text-gray-300 hover:bg-white/[0.025]">
          <span>查看当前读数与 ±8% 参考分析</span>
          <span className="text-[10px] text-gray-600">当前偏离 {pct(currentDeviation)}</span>
        </summary>
        <div className="border-t border-white/10 p-4">
          <section className="grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-3" aria-label={`${windowDays}日当前偏离度与${probabilityHorizon}日概率`}>
            <div className="bg-[#111619] p-5"><p className="text-[10px] text-gray-500">指数与数据日期</p><p className="mt-2 text-xl font-semibold text-white">{selectedIndex.name}</p><p className="mt-2 text-xs text-gray-500">{selectedIndex.current.date} · 收盘 {selectedIndex.current.close.toLocaleString("zh-CN")}</p></div>
            <div className="bg-[#111619] p-5"><p className="text-[10px] text-gray-500">{windowDays}日对数偏离度</p><p className="mt-2 text-2xl font-semibold" style={{ color: tone(currentDeviation) }}>{pct(currentDeviation)}</p><p className="mt-2 text-xs text-gray-500">MA{windowDays} {currentMovingAverage.toLocaleString("zh-CN")}</p></div>
            <div className="bg-[#111619] p-5"><p className="text-[10px] text-gray-500">{selectedSegment.label}分位</p><p className="mt-2 text-2xl font-semibold text-white">P{selectedWindow.currentPercentile.toFixed(1)}</p><p className="mt-2 text-xs text-gray-500">{currentBand?.label ?? "区间外"} · {rangeLabel(currentBand ?? selectedWindow.bands[0])}</p></div>
            <div className="bg-[#111619] p-5"><p className="text-[10px] text-gray-500">当前区间 · 未来{probabilityHorizon}日上涨</p><p className="mt-2 text-2xl font-semibold text-[#e7685d]">{probability(currentOutcome?.upProbabilityPct ?? null)}</p><p className="mt-2 text-xs text-gray-500">历史样本 {currentOutcome?.observations.toLocaleString() ?? "--"} 日</p></div>
            <div className="bg-[#111619] p-5"><p className="text-[10px] text-gray-500">当前区间 · 未来{probabilityHorizon}日下跌</p><p className="mt-2 text-2xl font-semibold text-[#55a876]">{probability(currentOutcome?.downProbabilityPct ?? null)}</p><p className="mt-2 text-xs text-gray-500">全区间上涨基准 {probability(selectedBaseline.upProbabilityPct)}</p></div>
            <div className="bg-[#111619] p-5"><p className="text-[10px] text-gray-500">当前区间 · 相对强弱</p><p className="mt-2 text-2xl font-semibold" style={{ color: RELATIVE_SIGNAL_STYLE[currentSignal].color }}>{RELATIVE_SIGNAL_STYLE[currentSignal].label}</p><p className="mt-2 text-xs text-gray-500">较上涨基准 {percentagePoint(currentOutcome?.probabilityLiftPct ?? null)}</p></div>
          </section>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="border border-[#55a876]/25 bg-[#55a876]/[0.035] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#65b986]">下穿 -8%</p>
              <p className="mt-3 text-sm text-white">位于历史 P{fixedBandReference.lowerPercentile.toFixed(1)}，占 {fixedBandReference.daysBelowLowerPct.toFixed(1)}% 的交易日</p>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                去重后 {fixedBandReference.lowerCrossings.observations} 次触发；随后{probabilityHorizon}日上涨 {probability(lowerCrossingOutcome.upProbabilityPct)}，平均收益 {pct(lowerCrossingOutcome.averageForwardPct)}。
              </p>
            </div>
            <div className="border border-[#e7685d]/25 bg-[#e7685d]/[0.035] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#e88a82]">上穿 +8%</p>
              <p className="mt-3 text-sm text-white">位于历史 P{fixedBandReference.upperPercentile.toFixed(1)}，上方占 {fixedBandReference.daysAboveUpperPct.toFixed(1)}% 的交易日</p>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                去重后 {fixedBandReference.upperCrossings.observations} 次触发；随后{probabilityHorizon}日上涨 {probability(upperCrossingOutcome.upProbabilityPct)}，平均收益 {pct(upperCrossingOutcome.averageForwardPct)}。
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-6 text-gray-500">
            ±8% 是视觉参考带，不是通用反转线。阈值在不同指数和均线周期中的历史分位差异很大；上穿 +8% 也可能代表趋势延续，而非立即见顶。
          </p>
        </div>
      </details>

      <details className="mt-3 border border-white/10 bg-[#0d1215]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-sm text-gray-300 hover:bg-white/[0.025]">
          <span>查看分位概率与完整统计</span>
          <span className="text-[10px] text-gray-600">{selectedSegment.label} · {selectedWindow.observations.toLocaleString()} 个交易日</span>
        </summary>
        <div className="border-t border-white/10 p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center border border-white/10 p-1" aria-label="选择后续走势窗口">
              <span className="px-2 text-[10px] text-gray-600">后续</span>
              {(["5", "10", "20"] as const).map((horizon) => (
                <button
                  key={horizon}
                  type="button"
                  aria-pressed={probabilityHorizon === horizon}
                  onClick={() => setProbabilityHorizon(horizon)}
                  className="h-8 px-2.5 text-xs"
                  style={{
                    background: probabilityHorizon === horizon ? "rgba(212,154,84,0.18)" : "transparent",
                    color: probabilityHorizon === horizon ? "#e6b878" : "#8e99a3",
                  }}
                >
                  {horizon}日
                </button>
              ))}
            </div>
            <select
              value={segmentId}
              onChange={(event) => setSegmentId(event.target.value)}
              className="h-10 border border-white/10 bg-[#111619] px-3 text-xs text-gray-300 outline-none"
              aria-label="选择历史统计区间"
            >
              {selectedIndex.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.label}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white">{windowDays}日偏离区间 · 后续{probabilityHorizon}日概率</h2>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              {selectedIndex.name} · 上涨基准 {probability(selectedBaseline.upProbabilityPct)}。红色表示区间上涨概率的95%范围整体高于基准，绿色表示整体低于基准，灰色表示差异暂不明显。
            </p>
          </div>
          <ProbabilityBandMap bands={selectedWindow.bands} currentBandId={selectedWindow.currentBandId} horizon={probabilityHorizon} />
          <div className="mt-5">
            <ProbabilityTable bands={selectedWindow.bands} currentBandId={selectedWindow.currentBandId} horizon={probabilityHorizon} baseline={selectedBaseline} />
          </div>
        </div>
      </details>
    </>
  );
}
