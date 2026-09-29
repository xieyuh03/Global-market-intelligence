"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type FactorId = "hkM2" | "chinaPpi" | "chinaRetail" | "creditImpulse";

type SeriesPoint = {
  date: string;
  hsiClose: number | null;
  composite: number | null;
  hkM2YoY: number | null;
  chinaPpiYoY: number | null;
  chinaRetailYoY: number | null;
  creditImpulse: number | null;
  hkM2Z: number | null;
  chinaPpiZ: number | null;
  chinaRetailZ: number | null;
  creditImpulseZ: number | null;
};

type LatestFactor = {
  id: FactorId;
  label: string;
  date: string;
  value: number;
  unit: string;
  zScore: number;
  contribution: number;
};

type TurningPoint = {
  id: string;
  type: "peak" | "trough";
  indicatorDate: string;
  indicatorValue: number;
  hsiDate: string | null;
  hsiClose: number | null;
  leadMonths: number | null;
  status: "matched" | "indicator-only";
};

export type HkLeadingIndicatorData = {
  generatedAt: string;
  methodology: {
    rollingWindowMonths: number;
    minimumObservations: number;
    compositeFormula: string;
    creditImpulseFormula: string;
    realTimeNote: string;
  };
  coverage: {
    firstCompositeDate: string;
    lastCompositeDate: string;
    firstHsiDate: string;
    lastHsiDate: string;
    observations: number;
  };
  latest: {
    compositeDate: string;
    composite: number;
    change3m: number | null;
    hsiDate: string;
    hsiClose: number;
    signal: {
      tone: "supportive" | "recovering" | "neutral" | "cooling" | "restrictive";
      label: string;
      summary: string;
    };
    components: LatestFactor[];
    analog: {
      sampleSize: number;
      medianForward6mPct: number | null;
      positiveRate6mPct: number | null;
    };
  };
  horizonStats: {
    months: number;
    correlation: number | null;
    sampleSize: number;
    medianReturnPct: number | null;
    positiveRatePct: number | null;
  }[];
  turningPoints: TurningPoint[];
  sources: {
    id: string;
    name: string;
    organization: string;
    url: string;
    coverage: string;
    frequency: string;
    releaseLag: string;
    caveat: string;
  }[];
  series: SeriesPoint[];
};

const RANGE_PRESETS = [
  { label: "3年", months: 36 },
  { label: "5年", months: 60 },
  { label: "10年", months: 120 },
  { label: "全量", months: Number.POSITIVE_INFINITY },
];

const FACTORS: {
  id: FactorId;
  label: string;
  zKey: keyof Pick<SeriesPoint, "hkM2Z" | "chinaPpiZ" | "chinaRetailZ" | "creditImpulseZ">;
  color: string;
}[] = [
  { id: "hkM2", label: "香港 M2 同比", zKey: "hkM2Z", color: "#55a8a1" },
  { id: "chinaPpi", label: "内地 PPI 同比", zKey: "chinaPpiZ", color: "#d49a54" },
  { id: "chinaRetail", label: "内地社零同比", zKey: "chinaRetailZ", color: "#9b8ac4" },
  { id: "creditImpulse", label: "社融流量强度", zKey: "creditImpulseZ", color: "#6e91c4" },
];

function number(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "--";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signed(value: number | null, suffix = "", digits = 2) {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${number(value, digits)}${suffix}`;
}

function signalColor(tone: HkLeadingIndicatorData["latest"]["signal"]["tone"]) {
  if (tone === "supportive" || tone === "recovering") return "#55a876";
  if (tone === "restrictive" || tone === "cooling") return "#e7685d";
  return "#d49a54";
}

function leadLabel(months: number | null) {
  if (months == null) return "未匹配";
  if (months > 0) return `领先 ${months} 个月`;
  if (months < 0) return `滞后 ${Math.abs(months)} 个月`;
  return "同步";
}

export default function HkLeadingIndicatorDashboard({ data }: { data: HkLeadingIndicatorData }) {
  const [rangeMonths, setRangeMonths] = useState(Number.POSITIVE_INFINITY);
  const [showTurningPoints, setShowTurningPoints] = useState(true);
  const visibleSeries = useMemo(
    () => Number.isFinite(rangeMonths) ? data.series.slice(-rangeMonths) : data.series,
    [data.series, rangeMonths],
  );
  const firstVisibleDate = visibleSeries[0]?.date ?? data.coverage.firstCompositeDate;
  const visibleTurningPoints = data.turningPoints.filter(
    (point) => point.indicatorDate >= firstVisibleDate && point.indicatorDate <= data.coverage.lastCompositeDate,
  );
  const color = signalColor(data.latest.signal.tone);

  return (
    <>
      <section className="grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4" aria-label="当前宏观观察">
        <div className="bg-[#111619] p-5">
          <p className="text-[10px] text-gray-500">合成观测值</p>
          <p className="mt-2 text-3xl font-semibold" style={{ color }}>{signed(data.latest.composite)}</p>
          <p className="mt-2 text-xs text-gray-500">{data.latest.compositeDate} · 36个月滚动标准分</p>
        </div>
        <div className="bg-[#111619] p-5">
          <p className="text-[10px] text-gray-500">研究判断</p>
          <p className="mt-2 text-xl font-semibold" style={{ color }}>{data.latest.signal.label}</p>
          <p className="mt-2 text-xs leading-5 text-gray-500">近3个月 {signed(data.latest.change3m)}</p>
        </div>
        <div className="bg-[#111619] p-5">
          <p className="text-[10px] text-gray-500">探索性相似状态后6个月</p>
          <p className="mt-2 text-2xl font-semibold text-white">{signed(data.latest.analog.medianForward6mPct, "%", 1)}</p>
          <p className="mt-2 text-xs text-gray-500">上涨频率 {number(data.latest.analog.positiveRate6mPct, 1)}% · 仅 {data.latest.analog.sampleSize} 个独立样本</p>
        </div>
        <div className="bg-[#111619] p-5">
          <p className="text-[10px] text-gray-500">恒生指数</p>
          <p className="mt-2 text-2xl font-semibold text-white">{number(data.latest.hsiClose, 0)}</p>
          <p className="mt-2 text-xs text-gray-500">{data.latest.hsiDate} · 已完成月收盘</p>
        </div>
      </section>

      <section className="mt-5 border border-white/10 bg-[#0d1215] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          <div>
            <h2 className="text-sm font-medium text-white">{data.latest.signal.summary}</h2>
            <p className="mt-2 text-xs leading-6 text-gray-500">
              这是月度宏观状态观察，不是单日择时。样本内3至12个月相关系数整体偏弱，历史相似样本与拐点配对不能证明稳定领先。
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 border border-white/10 bg-[#0d1215]" aria-label="恒生指数领航指标图">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-white">恒生指数领航指标</h2>
            <p className="mt-1 text-[10px] text-gray-600">蓝线为四因子等权合成值，金线为恒生指数月末收盘</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setRangeMonths(preset.months)}
                className="border px-2.5 py-1 text-[10px]"
                style={{
                  borderColor: rangeMonths === preset.months ? "rgba(212,154,84,0.5)" : "rgba(255,255,255,0.1)",
                  color: rangeMonths === preset.months ? "#d49a54" : "#8b959e",
                  background: rangeMonths === preset.months ? "rgba(212,154,84,0.08)" : "transparent",
                }}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowTurningPoints((current) => !current)}
              className="border border-white/10 px-2.5 py-1 text-[10px] text-gray-400 hover:bg-white/5"
            >
              {showTurningPoints ? "隐藏拐点" : "显示拐点"}
            </button>
          </div>
        </div>
        <div className="h-[480px] px-1 py-4 sm:px-4" data-testid="hk-leading-chart">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1200, height: 440 }}>
            <ComposedChart data={visibleSeries} margin={{ top: 24, right: 8, left: 4, bottom: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis
                dataKey="date"
                minTickGap={70}
                tick={{ fill: "#7f8992", fontSize: 10 }}
                tickFormatter={(date) => String(date).slice(0, 4)}
                axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                tickLine={false}
              />
              <YAxis
                yAxisId="composite"
                width={44}
                tick={{ fill: "#7f8992", fontSize: 10 }}
                tickFormatter={(value) => Number(value).toFixed(1)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="hsi"
                orientation="right"
                width={56}
                tick={{ fill: "#9c815f", fontSize: 10 }}
                tickFormatter={(value) => `${Math.round(Number(value) / 1_000)}k`}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              <ReferenceLine yAxisId="composite" y={0} stroke="rgba(255,255,255,0.28)" />
              <Tooltip
                formatter={(value, name) => {
                  const numeric = Number(value);
                  return name === "恒生指数"
                    ? [number(numeric, 0), name]
                    : [signed(numeric), name];
                }}
                labelFormatter={(label) => `月份 ${label}`}
                contentStyle={{ background: "#111619", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 0, fontSize: 11 }}
                labelStyle={{ color: "#f2f4f5", marginBottom: 6 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#89949e" }} />
              <Line yAxisId="composite" type="monotone" dataKey="composite" name="四因子领航值" stroke="#6e91c4" strokeWidth={2.2} dot={false} connectNulls={false} isAnimationActive={false} />
              <Line yAxisId="hsi" type="monotone" dataKey="hsiClose" name="恒生指数" stroke="#d49a54" strokeWidth={1.6} dot={false} connectNulls isAnimationActive={false} />
              {showTurningPoints ? visibleTurningPoints.map((point) => (
                <ReferenceDot
                  key={point.id}
                  yAxisId="composite"
                  x={point.indicatorDate}
                  y={point.indicatorValue}
                  r={3.5}
                  fill={point.type === "peak" ? "#e7685d" : "#55a876"}
                  stroke="#0d1215"
                  strokeWidth={1.5}
                  label={point.status === "matched" ? {
                    value: leadLabel(point.leadMonths),
                    position: point.type === "peak" ? "top" : "bottom",
                    fill: "#8e99a3",
                    fontSize: 9,
                  } : undefined}
                />
              )) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="四项因子最新值">
        {data.latest.components.map((factor) => (
          <article key={factor.id} className="border border-white/10 bg-[#111619] p-4">
            <p className="text-xs text-gray-400">{factor.label}</p>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <span className="font-mono text-xl text-white">{signed(factor.value, factor.unit, factor.unit === "%" ? 1 : 2)}</span>
              <span className="font-mono text-xs" style={{ color: factor.zScore >= 0 ? "#55a876" : "#e7685d" }}>z {signed(factor.zScore)}</span>
            </div>
            <p className="mt-2 text-[10px] text-gray-600">{factor.date} · 对合成值贡献 {signed(factor.contribution)}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 border border-white/10 bg-[#0d1215]" aria-label="四因子标准分">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-base font-semibold text-white">四项因子标准分</h2>
          <p className="mt-1 text-[10px] text-gray-600">每项只使用截至当月的滚动历史计算，不使用全样本均值和波动率</p>
        </div>
        <div className="h-[380px] px-1 py-4 sm:px-4">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1200, height: 340 }}>
            <LineChart data={visibleSeries} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="date" minTickGap={70} tick={{ fill: "#7f8992", fontSize: 10 }} tickFormatter={(date) => String(date).slice(0, 4)} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} />
              <YAxis width={44} tick={{ fill: "#7f8992", fontSize: 10 }} tickFormatter={(value) => Number(value).toFixed(1)} axisLine={false} tickLine={false} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.28)" />
              <Tooltip
                formatter={(value, name) => [signed(Number(value)), name]}
                labelFormatter={(label) => `月份 ${label}`}
                contentStyle={{ background: "#111619", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 0, fontSize: 11 }}
                labelStyle={{ color: "#f2f4f5", marginBottom: 6 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#89949e" }} />
              {FACTORS.map((factor) => (
                <Line key={factor.id} type="monotone" dataKey={factor.zKey} name={factor.label} stroke={factor.color} strokeWidth={1.35} dot={false} connectNulls={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1fr_1.25fr]">
        <div className="overflow-hidden border border-white/10">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-medium text-white">全样本基准与相关性</h2>
            <p className="mt-1 text-[10px] text-gray-600">回报中位数与上涨率是全部有效月份的恒指基准，不是正信号条件收益</p>
          </div>
          <table className="w-full text-xs">
            <thead className="border-b border-white/10 bg-white/[0.025] text-[10px] text-gray-500">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">未来窗口</th>
                <th className="px-3 py-2.5 text-right font-medium">相关系数</th>
                <th className="px-3 py-2.5 text-right font-medium">全样本中位回报</th>
                <th className="px-3 py-2.5 text-right font-medium">全样本上涨率</th>
                <th className="px-3 py-2.5 text-right font-medium">样本</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {data.horizonStats.map((item) => (
                <tr key={item.months}>
                  <td className="px-3 py-3 text-gray-300">{item.months}个月</td>
                  <td className="px-3 py-3 text-right font-mono text-gray-400">{number(item.correlation)}</td>
                  <td className="px-3 py-3 text-right font-mono text-gray-300">{signed(item.medianReturnPct, "%", 1)}</td>
                  <td className="px-3 py-3 text-right font-mono text-gray-300">{number(item.positiveRatePct, 1)}%</td>
                  <td className="px-3 py-3 text-right font-mono text-gray-500">{item.sampleSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden border border-white/10">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-medium text-white">探索性拐点配对</h2>
            <p className="mt-1 text-[10px] text-gray-600">正数表示合成值先出现；该表不含恒指独有拐点，不能当作命中率</p>
          </div>
          <div className="max-h-[340px] overflow-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="sticky top-0 border-b border-white/10 bg-[#111619] text-[10px] text-gray-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">类型</th>
                  <th className="px-3 py-2.5 text-left font-medium">领航值拐点</th>
                  <th className="px-3 py-2.5 text-left font-medium">恒指拐点</th>
                  <th className="px-3 py-2.5 text-right font-medium">领先/滞后</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {data.turningPoints.map((point) => (
                  <tr key={point.id}>
                    <td className="px-3 py-3" style={{ color: point.type === "peak" ? "#e7685d" : "#55a876" }}>{point.type === "peak" ? "顶部" : "底部"}</td>
                    <td className="px-3 py-3 font-mono text-gray-300">{point.indicatorDate}</td>
                    <td className="px-3 py-3 font-mono text-gray-400">{point.hsiDate ?? "无对应信号"}</td>
                    <td className="px-3 py-3 text-right text-gray-400">{leadLabel(point.leadMonths)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-8 border border-white/10 bg-[#0d1215] p-5" aria-label="口径与数据源">
        <h2 className="text-base font-semibold text-white">口径与数据边界</h2>
        <div className="mt-4 grid gap-3 text-xs leading-6 text-gray-400 md:grid-cols-2">
          <p>{data.methodology.compositeFormula}</p>
          <p>{data.methodology.creditImpulseFormula}</p>
          <p>{data.methodology.realTimeNote}</p>
          <p>覆盖 {data.coverage.firstCompositeDate} 至 {data.coverage.lastCompositeDate}，共 {data.coverage.observations} 个合成观测；恒指覆盖至 {data.coverage.lastHsiDate}。</p>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[880px] text-xs">
            <thead className="border-y border-white/10 text-[10px] text-gray-500">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">数据</th>
                <th className="px-3 py-2.5 text-left font-medium">机构</th>
                <th className="px-3 py-2.5 text-left font-medium">覆盖</th>
                <th className="px-3 py-2.5 text-left font-medium">频率 / 滞后</th>
                <th className="px-3 py-2.5 text-left font-medium">限制</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {data.sources.map((source) => (
                <tr key={source.id}>
                  <td className="px-3 py-3"><a href={source.url} target="_blank" rel="noreferrer" className="text-[#d49a54] hover:underline">{source.name}</a></td>
                  <td className="px-3 py-3 text-gray-300">{source.organization}</td>
                  <td className="px-3 py-3 font-mono text-gray-400">{source.coverage}</td>
                  <td className="px-3 py-3 text-gray-400">{source.frequency} · {source.releaseLag}</td>
                  <td className="px-3 py-3 text-gray-500">{source.caveat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
