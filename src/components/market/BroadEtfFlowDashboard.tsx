"use client";

import { useState } from "react";
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

type BenchmarkFlow = {
  id: string;
  label: string;
  estimatedNetFlowYi: number;
  funds: number;
};

type DailyFlow = {
  date: string;
  estimatedNetFlowYi: number;
  grossInflowYi: number;
  grossOutflowYi: number;
  funds: number;
  pricedFunds: number;
  excludedRecords: number;
  benchmarks: BenchmarkFlow[];
};

type FundFlow = {
  date: string;
  code: string;
  name: string;
  exchange: string;
  benchmarkId: string;
  benchmark: string;
  shareChange: number;
  shareChangePct: number;
  close: number | null;
  estimatedNetFlowCny: number | null;
  status: string;
};

export type BroadEtfFlowData = {
  generatedAt: string;
  asOf: string;
  coverage: {
    startDate: string;
    endDate: string;
    tradingDays: number;
    funds: number;
    sseFunds: number;
    szseFunds: number;
    partialDatesExcluded: Array<{ date: string; exchanges: string[] }>;
  };
  daily: DailyFlow[];
  latestFunds: FundFlow[];
  universe: Array<{ benchmarkId: string; benchmark: string }>;
};

function yi(value: number | null) {
  if (value == null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}亿`;
}

function tone(value: number | null) {
  if (value == null || value === 0) return "#aab4be";
  return value > 0 ? "#e7685d" : "#55a876";
}

export default function BroadEtfFlowDashboard({ data }: { data: BroadEtfFlowData }) {
  const [benchmarkId, setBenchmarkId] = useState("all");
  const benchmarkOptions = [...new Map(data.universe.map((item) => [item.benchmarkId, item.benchmark])).entries()]
    .map(([id, label]) => ({ id, label }));
  const chartData = data.daily.reduce<Array<{ date: string; flow: number; cumulative: number }>>((items, row) => {
    const flow = benchmarkId === "all"
      ? row.estimatedNetFlowYi
      : row.benchmarks.find((item) => item.id === benchmarkId)?.estimatedNetFlowYi ?? 0;
    const cumulative = (items.at(-1)?.cumulative ?? 0) + flow;
    return [...items, { date: row.date, flow, cumulative: +cumulative.toFixed(4) }];
  }, []);
  const latest = data.daily.at(-1);
  const latestBenchmark = benchmarkId === "all"
    ? null
    : latest?.benchmarks.find((item) => item.id === benchmarkId) ?? null;
  const latestFlow = latestBenchmark?.estimatedNetFlowYi ?? latest?.estimatedNetFlowYi ?? 0;
  const selectedFunds = data.latestFunds
    .filter((fund) => benchmarkId === "all" || fund.benchmarkId === benchmarkId)
    .filter((fund) => fund.status === "ready" && fund.estimatedNetFlowCny != null);
  const topInflows = selectedFunds.slice(0, 8);
  const topOutflows = selectedFunds.slice(-8).reverse();

  return (
    <>
      <section className="grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4" aria-label="ETF流向摘要">
        <div className="bg-[#111619] p-5"><p className="text-[10px] uppercase tracking-wider text-gray-500">最新完整交易日</p><p className="mt-2 text-2xl font-semibold text-white">{data.asOf}</p><p className="mt-2 text-xs text-gray-500">沪深两市份额均已披露</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] uppercase tracking-wider text-gray-500">净申购估算</p><p className="mt-2 text-2xl font-semibold" style={{ color: tone(latestFlow) }}>{yi(latestFlow)}</p><p className="mt-2 text-xs text-gray-500">份额变化 × 当日收盘价</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] uppercase tracking-wider text-gray-500">覆盖基金</p><p className="mt-2 text-2xl font-semibold text-white">{data.coverage.funds} 只</p><p className="mt-2 text-xs text-gray-500">沪 {data.coverage.sseFunds} · 深 {data.coverage.szseFunds}</p></div>
        <div className="bg-[#111619] p-5"><p className="text-[10px] uppercase tracking-wider text-gray-500">完整区间</p><p className="mt-2 text-2xl font-semibold text-white">{data.coverage.tradingDays} 日</p><p className="mt-2 text-xs text-gray-500">{data.coverage.startDate} 至 {data.coverage.endDate}</p></div>
      </section>

      <section className="mt-8" aria-label="宽基ETF日流向">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Creation / Redemption</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">宽基 ETF 日净申购</h2>
          </div>
          <select value={benchmarkId} onChange={(event) => setBenchmarkId(event.target.value)} className="h-9 border border-white/10 bg-[#111619] px-3 text-xs text-gray-300 outline-none">
            <option value="all">全部宽基</option>
            {benchmarkOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className="h-[390px] border border-white/10 bg-[#0d1215] px-2 py-4 sm:px-4">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1200, height: 350 }}>
            <ComposedChart data={chartData} margin={{ top: 12, right: 10, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#7f8992", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} />
              <YAxis yAxisId="flow" width={50} tick={{ fill: "#7f8992", fontSize: 10 }} tickFormatter={(value) => `${value}亿`} axisLine={false} tickLine={false} />
              <YAxis yAxisId="cumulative" orientation="right" width={50} tick={{ fill: "#a88b65", fontSize: 10 }} tickFormatter={(value) => `${value}亿`} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value, name) => [`${Number(value).toFixed(2)}亿元`, name === "flow" ? "当日净申购" : "区间累计"]} contentStyle={{ background: "#111619", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 0, fontSize: 11 }} labelStyle={{ color: "#f2f4f5", marginBottom: 6 }} />
              <Bar yAxisId="flow" dataKey="flow" name="flow" barSize={28} isAnimationActive={false}>{chartData.map((item) => <Cell key={item.date} fill={tone(item.flow)} />)}</Bar>
              <Line yAxisId="cumulative" dataKey="cumulative" name="cumulative" stroke="#d49a54" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
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
                  <span className="min-w-0"><span className="block truncate text-gray-300">{fund.name}</span><span className="mt-1 block text-[10px] text-gray-600">{fund.benchmark} · {fund.exchange === "SSE" ? "沪市" : "深市"}</span></span>
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
        <p><b className="text-gray-300">完整性：</b>只汇总沪深两市同时披露的日期；单日份额变化达到50%或缺少价格的记录不进入总额。</p>
      </section>
    </>
  );
}