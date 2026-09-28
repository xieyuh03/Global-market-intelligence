"use client";

import { useDeferredValue, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ProbabilityBand = {
  id: string;
  label: string;
  side: "bottom" | "neutral" | "top";
  lowerPct: number;
  upperPct: number;
  observations: number;
  reboundProbability5dPct: number;
  reboundProbability20dPct: number;
  reboundProbability60dPct: number;
  drawdownProbability5dPct: number;
  drawdownProbability20dPct: number;
  drawdownProbability60dPct: number;
  gain5Within20dProbabilityPct: number;
  loss5Within20dProbabilityPct: number;
  averageForward5dPct: number;
  averageForward20dPct: number;
  averageForward60dPct: number;
};

type WindowStatistics = {
  currentDeviationPct: number;
  currentPercentile: number;
  currentBandId: string | null;
  bands: ProbabilityBand[];
};

type Segment = {
  id: string;
  label: string;
  start: string;
  actualStart: string;
  end: string;
  observations: number;
  windows: { "60": WindowStatistics; "200": WindowStatistics };
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
    ma200: number;
    deviation60Pct: number;
    deviation200Pct: number;
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
  deviation200Pct: number | null;
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
  { label: "全量", days: Number.POSITIVE_INFINITY },
];

function pct(value: number | null, digits = 2) {
  if (value == null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function probability(value: number | null) {
  return value == null ? "--" : `${value.toFixed(1)}%`;
}

function rangeLabel(band: ProbabilityBand) {
  return `${pct(band.lowerPct)} 至 ${pct(band.upperPct)}`;
}

function tone(value: number) {
  if (value > 0) return "#e7685d";
  if (value < 0) return "#55a876";
  return "#aab4be";
}

function ProbabilityTable({ title, bands, side }: { title: string; bands: ProbabilityBand[]; side: "bottom" | "top" }) {
  const rebound = side === "bottom";
  return (
    <div className="overflow-hidden border border-white/10">
      <div className="border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-medium text-white">{title}</h3>
        <p className="mt-1 text-[10px] text-gray-600">{rebound ? "偏离度落入低位后的上涨频率" : "偏离度落入高位后的下跌频率"}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-xs">
          <thead className="border-b border-white/10 bg-white/[0.025] text-[10px] text-gray-500">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">历史位置</th>
              <th className="px-3 py-2.5 text-left font-medium">偏离度范围</th>
              <th className="px-3 py-2.5 text-right font-medium">样本</th>
              <th className="px-3 py-2.5 text-right font-medium">5日{rebound ? "上涨" : "下跌"}</th>
              <th className="px-3 py-2.5 text-right font-medium">20日{rebound ? "上涨" : "下跌"}</th>
              <th className="px-3 py-2.5 text-right font-medium">60日{rebound ? "上涨" : "下跌"}</th>
              <th className="px-3 py-2.5 text-right font-medium">20日内{rebound ? "+5%" : "-5%"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07]">
            {bands.map((band) => (
              <tr key={band.id} className="hover:bg-white/[0.025]">
                <td className="px-3 py-3 text-gray-300">{band.label}</td>
                <td className="px-3 py-3 font-mono text-gray-500">{rangeLabel(band)}</td>
                <td className="px-3 py-3 text-right font-mono text-gray-400">{band.observations.toLocaleString()}</td>
                <td className="px-3 py-3 text-right font-mono text-gray-300">{probability(rebound ? band.reboundProbability5dPct : band.drawdownProbability5dPct)}</td>
                <td className="px-3 py-3 text-right font-mono text-gray-300">{probability(rebound ? band.reboundProbability20dPct : band.drawdownProbability20dPct)}</td>
                <td className="px-3 py-3 text-right font-mono text-gray-300">{probability(rebound ? band.reboundProbability60dPct : band.drawdownProbability60dPct)}</td>
                <td className="px-3 py-3 text-right font-mono" style={{ color: rebound ? "#e7685d" : "#55a876" }}>{probability(rebound ? band.gain5Within20dProbabilityPct : band.loss5Within20dProbabilityPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DeviationDashboard({ data, dataBase }: { data: DeviationStatistics; dataBase: string }) {
  const [indexId, setIndexId] = useState(data.indices[0].id);
  const [segmentId, setSegmentId] = useState(data.indices[0].segments[0].id);
  const [windowDays, setWindowDays] = useState<"60" | "200">("200");
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
  const currentBand = selectedWindow.bands.find((band) => band.id === selectedWindow.currentBandId) ?? null;

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
  const startDate = series[startIndex]?.date ?? "--";
  const endDate = series[endIndex]?.date ?? "--";
  const bottomBands = selectedWindow.bands.filter((band) => band.side === "bottom");
  const topBands = selectedWindow.bands.filter((band) => band.side === "top");

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

  return (
    <>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="选择指数">
        {data.indices.map((index) => (
          <button key={index.id} type="button" role="tab" aria-selected={indexId === index.id} onClick={() => selectIndex(index)} className="h-9 border px-3 text-xs transition-colors" style={{ color: indexId === index.id ? "#f4f5f6" : "#89949e", borderColor: indexId === index.id ? "rgba(212,154,84,0.45)" : "rgba(255,255,255,0.10)", background: indexId === index.id ? "rgba(212,154,84,0.09)" : "transparent" }}>{index.name}</button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="flex border border-white/10 p-1" aria-label="选择偏离度周期">
          {(["60", "200"] as const).map((window) => <button key={window} type="button" onClick={() => setWindowDays(window)} className="h-7 px-2.5 text-[11px]" style={{ background: windowDays === window ? "#d49a54" : "transparent", color: windowDays === window ? "#111619" : "#8e99a3" }}>{window}日偏离</button>)}
        </div>
        <select value={segmentId} onChange={(event) => setSegmentId(event.target.value)} className="h-9 border border-white/10 bg-[#111619] px-3 text-xs text-gray-300 outline-none" aria-label="选择历史统计区间">{selectedIndex.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.label}</option>)}</select>
      </div>

      <section className="mt-5 grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-3" aria-label="当前偏离度">
        <div className="bg-[#111619] p-5"><p className="text-[10px] text-gray-500">数据日期</p><p className="mt-2 text-xl font-semibold text-white">{selectedIndex.current.date}</p><p className="mt-2 text-xs text-gray-500">收盘 {selectedIndex.current.close.toLocaleString("zh-CN")}</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] text-gray-500">60日对数偏离度</p><p className="mt-2 text-2xl font-semibold" style={{ color: tone(selectedIndex.current.deviation60Pct) }}>{pct(selectedIndex.current.deviation60Pct)}</p><p className="mt-2 text-xs text-gray-500">MA60 {selectedIndex.current.ma60.toLocaleString("zh-CN")}</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] text-gray-500">200日对数偏离度</p><p className="mt-2 text-2xl font-semibold" style={{ color: tone(selectedIndex.current.deviation200Pct) }}>{pct(selectedIndex.current.deviation200Pct)}</p><p className="mt-2 text-xs text-gray-500">MA200 {selectedIndex.current.ma200.toLocaleString("zh-CN")}</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] text-gray-500">{selectedSegment.label}分位</p><p className="mt-2 text-2xl font-semibold text-white">P{selectedWindow.currentPercentile.toFixed(1)}</p><p className="mt-2 text-xs text-gray-500">{windowDays}日 · {currentBand?.label ?? "区间外"}</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] text-gray-500">当前档位 · 未来20日上涨</p><p className="mt-2 text-2xl font-semibold text-[#e7685d]">{probability(currentBand?.reboundProbability20dPct ?? null)}</p><p className="mt-2 text-xs text-gray-500">历史样本 {currentBand?.observations.toLocaleString() ?? "--"} 日</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] text-gray-500">当前档位 · 未来20日下跌</p><p className="mt-2 text-2xl font-semibold text-[#55a876]">{probability(currentBand?.drawdownProbability20dPct ?? null)}</p><p className="mt-2 text-xs text-gray-500">同一档位的历史频率</p></div>
      </section>

      <section className="mt-8 border border-white/10 bg-[#0d1215]" aria-label="对数偏离度日线图">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div><h2 className="text-base font-semibold text-white">60日 / 200日均线对数偏离度</h2><p className="mt-1 text-[10px] text-gray-600">横轴为交易日期，悬停查看当日精确值</p></div>
          <div className="flex flex-wrap items-center gap-3 text-[10px]" aria-live="polite" data-testid="deviation-hover-readout">
            <span className="font-mono text-gray-300">{hoveredPoint?.date ?? "--"}</span>
            <span className="text-[#d49a54]">60日 {pct(hoveredPoint?.deviation60Pct ?? null)}</span>
            <span className="text-[#55a8a1]">200日 {pct(hoveredPoint?.deviation200Pct ?? null)}</span>
          </div>
        </div>
        <div
          className="h-[440px] px-1 py-4 sm:px-4"
          data-testid="deviation-chart"
          onPointerMove={(event) => {
            if (!visibleSeries.length) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const plotLeft = bounds.left + 56;
            const plotWidth = Math.max(1, bounds.width - 68);
            const ratio = Math.max(0, Math.min(1, (event.clientX - plotLeft) / plotWidth));
            const point = visibleSeries[Math.round(ratio * (visibleSeries.length - 1))];
            if (point) setHoveredPoint(point);
          }}
        >
          {loading ? <div className="grid h-full place-items-center text-xs text-gray-500">加载日频数据…</div> : null}
          {error ? <div className="grid h-full place-items-center text-xs text-red-300">{error}</div> : null}
          {!loading && !error && visibleSeries.length ? (
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1200, height: 400 }}>
              <LineChart data={visibleSeries} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="date" minTickGap={70} tick={{ fill: "#7f8992", fontSize: 10 }} tickFormatter={(date) => String(date).slice(0, 7)} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} />
                <YAxis width={52} tick={{ fill: "#7f8992", fontSize: 10 }} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} axisLine={false} tickLine={false} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" />
                <Tooltip formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]} labelFormatter={(label) => `交易日 ${label}`} contentStyle={{ background: "#111619", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 0, fontSize: 11 }} labelStyle={{ color: "#f2f4f5", marginBottom: 6 }} />
                <Line type="monotone" dataKey="deviation60Pct" name="60日偏离度" stroke="#d49a54" strokeWidth={1.4} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="deviation200Pct" name="200日偏离度" stroke="#55a8a1" strokeWidth={1.8} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : null}
        </div>
        <div className="border-t border-white/10 px-4 py-4">
          <div className="mb-4 flex flex-wrap gap-1.5">{RANGE_PRESETS.map((preset) => <button key={preset.label} type="button" onClick={() => applyPreset(preset.days)} className="border border-white/10 px-2.5 py-1 text-[10px] text-gray-400 hover:bg-white/5">{preset.label}</button>)}</div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-[11px] text-gray-500"><span className="mb-2 flex justify-between"><span>开始日期</span><span className="font-mono text-gray-300">{startDate}</span></span><input type="range" min={0} max={Math.max(0, endIndex - 1)} value={Math.min(startIndex, Math.max(0, endIndex - 1))} onChange={(event) => setStartIndex(Number(event.target.value))} className="w-full accent-[#d49a54]" /></label>
            <label className="text-[11px] text-gray-500"><span className="mb-2 flex justify-between"><span>结束日期</span><span className="font-mono text-gray-300">{endDate}</span></span><input type="range" min={Math.min(series.length - 1, startIndex + 1)} max={Math.max(0, series.length - 1)} value={endIndex} onChange={(event) => setEndIndex(Number(event.target.value))} className="w-full accent-[#55a8a1]" /></label>
          </div>
        </div>
      </section>

      <section className="mt-8" aria-label="历史概率统计">
        <div className="mb-4"><p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Historical probability</p><h2 className="mt-2 text-2xl font-semibold text-white">抄底 / 逃顶参考概率</h2><p className="mt-2 text-xs text-gray-500">概率表与图分开；当前选择共 {selectedSegment.observations.toLocaleString()} 个交易日样本。</p></div>
        <div className="grid gap-6 xl:grid-cols-2">
          <ProbabilityTable title="低位：反弹概率" bands={bottomBands} side="bottom" />
          <ProbabilityTable title="高位：回撤概率" bands={topBands} side="top" />
        </div>
      </section>
    </>
  );
}