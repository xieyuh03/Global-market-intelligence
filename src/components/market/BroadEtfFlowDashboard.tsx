"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type FlowMetrics = {
  estimatedNetFlowCny: number;
  estimatedNetFlowYi: number;
  grossInflowYi: number;
  grossOutflowYi: number;
  funds: number;
  pricedFunds: number;
  excludedRecords: number;
};

type CategoryFlow = FlowMetrics & {
  id: string;
  label: string;
};

type DailyFlow = {
  date: string;
  status: "complete" | "partial";
  exchanges: string[];
  categoryFlows: Array<number | null>;
  benchmarkFlows: Array<number | null>;
};

type FundFlow = {
  date: string;
  code: string;
  name: string;
  exchange: string;
  primaryCategoryId: string;
  primaryCategory: string;
  categoryIds: string[];
  benchmarkId: string | null;
  benchmark: string | null;
  shareChange: number;
  shareChangePct: number;
  close: number | null;
  estimatedNetFlowCny: number | null;
  status: string;
};

type BenchmarkOption = {
  id: string;
  label: string;
  indexAvailable: boolean;
  indexLabel: string | null;
};

type BenchmarkIndexData = {
  id: string;
  label: string;
  points: Array<[string, number]>;
};

export type BroadEtfFlowData = {
  generatedAt: string;
  asOf: string;
  coverage: {
    startDate: string;
    fullMarketStartDate: string;
    endDate: string;
    tradingDays: number;
    completeTradingDays: number;
    partialTradingDays: number;
    fundDetailStartDate: string;
    funds: number;
    sseFunds: number;
    szseFunds: number;
  };
  categories: Array<{ id: string; label: string; description: string }>;
  benchmarks: BenchmarkOption[];
  daily: DailyFlow[];
  latestCategories: CategoryFlow[];
  latestFunds: FundFlow[];
};

function yi(value: number | null) {
  if (value == null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}亿`;
}

function tone(value: number | null) {
  if (value == null || value === 0) return "#aab4be";
  return value > 0 ? "#e7685d" : "#55a876";
}

function indexPoints(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function monthsBefore(date: string, months: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() - months);
  return value.toISOString().slice(0, 10);
}

function presetStart(id: string, endDate: string, firstDate: string) {
  if (id === "1m") return monthsBefore(endDate, 1);
  if (id === "3m") return monthsBefore(endDate, 3);
  if (id === "6m") return monthsBefore(endDate, 6);
  if (id === "ytd") return `${endDate.slice(0, 4)}-01-01`;
  if (id === "1y") return monthsBefore(endDate, 12);
  return firstDate;
}

export default function BroadEtfFlowDashboard({ data, indexSeriesBaseUrl }: { data: BroadEtfFlowData; indexSeriesBaseUrl: string }) {
  const [categoryId, setCategoryId] = useState("all-a");
  const [benchmarkId, setBenchmarkId] = useState("all");
  const [rangePreset, setRangePreset] = useState("3m");
  const [rangeStart, setRangeStart] = useState(() => presetStart("3m", data.asOf, data.coverage.startDate));
  const [rangeEnd, setRangeEnd] = useState(data.asOf);
  const [overlayMode, setOverlayMode] = useState<"cumulative" | "index" | "none">("cumulative");
  const [indexSeries, setIndexSeries] = useState<BenchmarkIndexData | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexError, setIndexError] = useState(false);
  const categoryOptions = data.categories.filter((category) => category.id !== "unclassified");
  const selectedCategory = categoryOptions.find((category) => category.id === categoryId) ?? categoryOptions[0];
  const categoryIndex = data.categories.findIndex((category) => category.id === categoryId);
  const benchmarkIndex = data.benchmarks.findIndex((benchmark) => benchmark.id === benchmarkId);
  const benchmarkOptions = data.benchmarks;
  const selectedBenchmark = data.benchmarks.find((benchmark) => benchmark.id === benchmarkId) ?? null;
  const canShowIndex = categoryId === "broad" && benchmarkId !== "all" && selectedBenchmark?.indexAvailable === true;

  useEffect(() => {
    if (overlayMode !== "index" || !canShowIndex) return;
    let active = true;
    fetch(`${indexSeriesBaseUrl}/${benchmarkId}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Index series ${response.status}`);
        return response.json() as Promise<BenchmarkIndexData>;
      })
      .then((series) => { if (active) setIndexSeries(series); })
      .catch(() => { if (active) setIndexError(true); })
      .finally(() => { if (active) setIndexLoading(false); });
    return () => { active = false; };
  }, [benchmarkId, canShowIndex, indexSeriesBaseUrl, overlayMode]);

  const selectedDaily = data.daily.flatMap((row) => {
    const flow = categoryId === "broad" && benchmarkId !== "all"
      ? row.benchmarkFlows[benchmarkIndex]
      : row.categoryFlows[categoryIndex];
    return flow == null ? [] : [{ date: row.date, status: row.status, flow }];
  }).filter((row) => row.date >= rangeStart && row.date <= rangeEnd);
  const indexByDate = new Map(indexSeries?.id === benchmarkId ? indexSeries.points : []);
  const activeOverlayMode = overlayMode === "index" && !canShowIndex ? "none" : overlayMode;
  const chartData = selectedDaily.reduce<Array<{ date: string; status: string; flow: number; cumulative: number; indexValue: number | null }>>((items, row) => {
    const cumulative = (items.at(-1)?.cumulative ?? 0) + row.flow;
    const indexClose = indexByDate.get(row.date);
    const indexValue = indexClose ?? null;
    return [...items, { ...row, cumulative: +cumulative.toFixed(4), indexValue }];
  }, []);
  const latest = data.daily.find((row) => row.date === data.asOf) ?? data.daily.at(-1);
  const latestCategory = data.latestCategories.find((item) => item.id === categoryId);
  const latestBenchmarkFlow = categoryId === "broad" && benchmarkId !== "all" ? latest?.benchmarkFlows[benchmarkIndex] : null;
  const latestFlow = latestBenchmarkFlow ?? latestCategory?.estimatedNetFlowYi ?? 0;
  const selectedFunds = data.latestFunds
    .filter((fund) => fund.categoryIds.includes(categoryId))
    .filter((fund) => categoryId !== "broad" || benchmarkId === "all" || fund.benchmarkId === benchmarkId)
    .filter((fund) => fund.status === "ready" && fund.estimatedNetFlowCny != null);
  const topInflows = selectedFunds.slice(0, 8);
  const topOutflows = selectedFunds.slice(-8).reverse();
  const overlayDataKey = activeOverlayMode === "index" ? "indexValue" : "cumulative";
  const overlayLabel = activeOverlayMode === "index"
    ? `${selectedBenchmark?.indexLabel ?? selectedBenchmark?.label}（实际点位）`
    : "区间累计净申购（亿元）";

  function applyRangePreset(id: string) {
    setRangePreset(id);
    setRangeEnd(data.asOf);
    setRangeStart(presetStart(id, data.asOf, data.coverage.startDate));
  }

  return (
    <>
      <section className="grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4" aria-label="ETF流向摘要">
        <div className="bg-[#111619] p-5"><p className="text-[10px] uppercase tracking-wider text-gray-500">最新完整交易日</p><p className="mt-2 text-2xl font-semibold text-white">{data.asOf}</p><p className="mt-2 text-xs text-gray-500">沪深两市份额均已披露</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] uppercase tracking-wider text-gray-500">净申购估算</p><p className="mt-2 text-2xl font-semibold" style={{ color: tone(latestFlow) }}>{yi(latestFlow)}</p><p className="mt-2 text-xs text-gray-500">份额变化 × 当日收盘价</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] uppercase tracking-wider text-gray-500">当前分类</p><p className="mt-2 text-2xl font-semibold text-white">{latestCategory?.funds ?? 0} 只</p><p className="mt-2 text-xs text-gray-500">{selectedCategory?.label} · 已计价 {latestCategory?.pricedFunds ?? 0}</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] uppercase tracking-wider text-gray-500">历史覆盖</p><p className="mt-2 text-2xl font-semibold text-white">{data.coverage.tradingDays} 日</p><p className="mt-2 text-xs text-gray-500">沪市 {data.coverage.startDate} 起 · 沪深 {data.coverage.fullMarketStartDate} 起</p></div>
      </section>

      <section className="mt-8" aria-label="ETF分类切换">
        <div className="flex gap-px overflow-x-auto border-y border-white/10 bg-white/10 p-px">
          {categoryOptions.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => { setCategoryId(category.id); setBenchmarkId("all"); if (overlayMode === "index") setOverlayMode("cumulative"); }}
              className={`min-w-20 flex-1 px-4 py-3 text-xs transition-colors ${category.id === categoryId ? "bg-[#d49a54] font-medium text-[#111619]" : "bg-[#111619] text-gray-400 hover:text-white"}`}
              title={category.description}
            >
              {category.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8" aria-label="ETF分类日流向">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Creation / Redemption</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{selectedCategory?.label} ETF 日净申购</h2>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <div className="flex overflow-x-auto border border-white/10">
              {[{ id: "1m", label: "1月" }, { id: "3m", label: "3月" }, { id: "6m", label: "6月" }, { id: "ytd", label: "今年" }, { id: "1y", label: "1年" }, { id: "all", label: "全部" }].map((item) => (
                <button key={item.id} type="button" onClick={() => applyRangePreset(item.id)} className={`h-9 shrink-0 px-3 text-xs ${rangePreset === item.id ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}>{item.label}</button>
              ))}
            </div>
            {categoryId === "broad" ? (
              <select value={benchmarkId} onChange={(event) => { const nextId = event.target.value; const nextHasIndex = data.benchmarks.find((item) => item.id === nextId)?.indexAvailable; setBenchmarkId(nextId); if (overlayMode === "index" && !nextHasIndex) setOverlayMode("cumulative"); else if (overlayMode === "index") { setIndexLoading(true); setIndexError(false); } }} className="h-9 border border-white/10 bg-[#111619] px-3 text-xs text-gray-300 outline-none" aria-label="宽基指数族">
                <option value="all">全部宽基</option>
                {benchmarkOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            ) : null}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-y border-white/10 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <label className="flex items-center gap-2"><span>起始</span><input type="date" min={data.coverage.startDate} max={rangeEnd} value={rangeStart} onChange={(event) => { setRangePreset("custom"); setRangeStart(event.target.value); }} className="h-9 border border-white/10 bg-[#111619] px-2 text-gray-300 outline-none" /></label>
            <label className="flex items-center gap-2"><span>结束</span><input type="date" min={rangeStart} max={data.asOf} value={rangeEnd} onChange={(event) => { setRangePreset("custom"); setRangeEnd(event.target.value); }} className="h-9 border border-white/10 bg-[#111619] px-2 text-gray-300 outline-none" /></label>
          </div>
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-gray-600">叠加</span>
            <div className="flex max-w-full overflow-x-auto border border-white/10">
              {[{ id: "cumulative", label: "累计净申购", disabled: false }, { id: "index", label: "对应指数", disabled: !canShowIndex }, { id: "none", label: "无", disabled: false }].map((item) => (
                <button key={item.id} type="button" disabled={item.disabled} onClick={() => { if (item.id === "index") { setIndexLoading(true); setIndexError(false); } setOverlayMode(item.id as "cumulative" | "index" | "none"); }} className={`h-8 shrink-0 whitespace-nowrap px-2 text-xs sm:px-3 ${overlayMode === item.id ? "bg-[#d49a54] text-[#111619]" : item.disabled ? "cursor-not-allowed text-gray-700" : "text-gray-500 hover:text-gray-300"}`}>{item.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-gray-500" aria-label="图表图例">
          <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 bg-[#e7685d]" />日净申购 / 净赎回</span>
          {activeOverlayMode !== "none" ? <span className="flex items-center gap-2"><i className="h-0.5 w-5 bg-[#d49a54]" />{overlayLabel}</span> : null}
          {indexLoading ? <span>指数加载中</span> : null}
          {indexError ? <span className="text-[#e7685d]">指数暂不可用</span> : null}
        </div>
        <div className="h-[390px] border border-white/10 bg-[#0d1215] px-2 py-4 sm:px-4">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1200, height: 350 }}>
            <ComposedChart data={chartData} margin={{ top: 12, right: 10, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#7f8992", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} />
              <YAxis yAxisId="flow" width={50} tick={{ fill: "#7f8992", fontSize: 10 }} tickFormatter={(value) => `${value}亿`} axisLine={false} tickLine={false} />
              {activeOverlayMode !== "none" ? <YAxis yAxisId="overlay" orientation="right" width={activeOverlayMode === "index" ? 64 : 52} domain={["auto", "auto"]} tick={{ fill: "#a88b65", fontSize: 10 }} tickFormatter={(value) => activeOverlayMode === "index" ? indexPoints(Number(value)) : `${value}亿`} axisLine={false} tickLine={false} /> : null}
              <Tooltip formatter={(value, name) => [activeOverlayMode === "index" && name === overlayLabel ? `${indexPoints(Number(value))} 点` : `${Number(value).toFixed(2)}亿元`, name]} contentStyle={{ background: "#111619", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 0, fontSize: 11 }} labelStyle={{ color: "#f2f4f5", marginBottom: 6 }} />
              <Bar yAxisId="flow" dataKey="flow" name="日净申购" maxBarSize={28} isAnimationActive={false}>{chartData.map((item) => <Cell key={item.date} fill={tone(item.flow)} fillOpacity={item.status === "partial" ? 0.4 : 1} />)}</Bar>
              {activeOverlayMode !== "none" ? <Line yAxisId="overlay" dataKey={overlayDataKey} name={overlayLabel} stroke="#d49a54" strokeWidth={2} dot={false} activeDot={{ r: 3 }} connectNulls isAnimationActive={false} /> : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2" aria-label="ETF贡献明细">
        {[{ title: "净申购贡献", rows: topInflows }, { title: "净赎回贡献", rows: topOutflows }].map((group) => (
          <div key={group.title} className="border-y border-white/10">
            <div className="flex items-center justify-between border-b border-white/10 py-3"><h3 className="text-sm font-medium text-white">{group.title}</h3><span className="text-[10px] text-gray-600">{data.asOf}</span></div>
            <div className="divide-y divide-white/[0.07]">
              {group.rows.map((fund) => (
                <div key={fund.code} className="grid grid-cols-[56px_minmax(0,1fr)_82px] items-center gap-3 py-3 text-xs">
                  <span className="font-mono text-gray-600">{fund.code}</span>
                  <span className="min-w-0"><span className="block truncate text-gray-300">{fund.name}</span><span className="mt-1 block text-[10px] text-gray-600">{fund.benchmark ?? fund.primaryCategory} · {fund.exchange === "SSE" ? "沪市" : "深市"}</span></span>
                  <span className="text-right font-mono" style={{ color: tone((fund.estimatedNetFlowCny ?? 0) / 100_000_000) }}>{yi((fund.estimatedNetFlowCny ?? 0) / 100_000_000)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-8 border-y border-white/10 py-4 text-xs leading-6 text-gray-500" aria-label="数据口径">
        <p><b className="text-gray-300">份额来源：</b>上海证券交易所 TOT_VOL 与深圳证券交易所基金规模（份）。</p>
        <p><b className="text-gray-300">金额口径：</b>当日份额减前一披露交易日份额，再乘当日不复权收盘价；因此是净申购金额估算，不是成交额、主力资金流或交易所现金结算值。</p>
        <p><b className="text-gray-300">覆盖边界：</b>{data.coverage.startDate} 起为沪市历史，{data.coverage.fullMarketStartDate} 起为沪深完整历史；图中低透明度柱表示单市场覆盖。</p>
        <p><b className="text-gray-300">黄色曲线：</b>累计模式为所选区间内日净申购额逐日累加，净赎回占优时会落入负值；切换日期后从新区间重新计算。指数模式显示对应指数的实际收盘点位。</p>
        <p><b className="text-gray-300">异常处理：</b>单日份额变化达到50%或缺少价格的记录不进入总额，但保留在明细状态中。</p>
      </section>
    </>
  );
}