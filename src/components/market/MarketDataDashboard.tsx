"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleGauge,
  RefreshCw,
} from "lucide-react";
import Card from "@/components/ui/Card";
import { marketFlowsUrl } from "@/lib/data-source";

type Market = {
  id: string;
  name: string;
  shortName: string;
  symbol: string;
  region: string;
  asOf: string;
  price: number;
  return1d: number;
  return5d: number;
  return20d: number;
  volumeRatio: number;
  flowScore: number;
  signal: string;
  metrics: {
    preference20d: number;
    persistence20d: number;
    acceleration: number;
    relativeReturn20d: number;
    regime: string;
  };
};

type MarketResponse = {
  generatedAt: string;
  source: string;
  methodology: string;
  summary: {
    strongest: Market;
    weakest: Market;
    positiveCount: number;
    negativeCount: number;
    averageScore: number;
    marketCount: number;
  };
  factorModel: {
    status: "ready" | "partial" | "unavailable";
    readyMarkets: number;
    windowDays: number;
    commonFactors: Array<{
      id: string;
      label: string;
      symbol: string;
      unit: "percent" | "basis_points";
      move20d: number;
    }>;
  };
  markets: Market[];
};

type SortKey = "preference" | "return20d" | "volume";

function signed(value: number, digits = 1, suffix = "%") {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`;
}

function tone(value: number) {
  if (value > 0) return "#d49a54";
  if (value < 0) return "#55a8a1";
  return "#8b949e";
}

function factorValue(value: number, unit: "percent" | "basis_points") {
  return signed(value, unit === "basis_points" ? 0 : 2, unit === "basis_points" ? " bp" : "%");
}

export default function MarketDataDashboard() {
  const [data, setData] = useState<MarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [region, setRegion] = useState("全部");
  const [sortKey, setSortKey] = useState<SortKey>("preference");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(marketFlowsUrl(), { cache: "no-store" });
      if (!response.ok) throw new Error("市场快照暂时不可用");
      setData(await response.json() as MarketResponse);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "市场数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const regions = useMemo(() => ["全部", ...new Set((data?.markets ?? []).map((market) => market.region))], [data]);
  const markets = useMemo(() => (data?.markets ?? [])
    .filter((market) => region === "全部" || market.region === region)
    .sort((left, right) => {
      if (sortKey === "return20d") return right.return20d - left.return20d;
      if (sortKey === "volume") return right.volumeRatio - left.volumeRatio;
      return right.metrics.preference20d - left.metrics.preference20d;
    }), [data, region, sortKey]);

  return (
    <div className="mx-auto max-w-[1500px] px-3 pb-16 sm:px-5 lg:px-8">
      <header className="mb-8 flex items-end justify-between gap-5 flex-wrap">
        <div>
          <div className="mb-3 flex items-center gap-3 text-[#68737b]">
            <span className="h-px w-8 bg-white/20" />
            <span className="text-[10px] uppercase tracking-[0.22em]">Market observatory</span>
          </div>
          <h1 className="text-4xl font-bold text-white sm:text-5xl">市场数据</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#90999f]">
            先看全球共同因子，再比较区域超额偏好与价格确认。所有资金偏好均为 ETF 量价代理，不等于真实申赎。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-[#59636a]">Snapshot</p>
            <p className="mt-1 text-[11px] text-[#89939a]">{data ? new Date(data.generatedAt).toLocaleString("zh-CN") : "等待数据"}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            title="重新读取市场快照"
            className="grid h-10 w-10 place-items-center border border-white/10 text-[#7d878e] transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {error ? <div className="mb-6 border border-red-400/20 bg-red-400/[0.05] px-4 py-3 text-sm text-red-300">{error}</div> : null}

      {data ? (
        <>
          <section className="mb-8 grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4" aria-label="市场摘要">
            {[
              { label: "风险广度", value: `${data.summary.positiveCount}/${data.summary.marketCount}`, note: "处于增配状态", icon: Activity, color: "#d49a54" },
              { label: "偏好领先", value: data.summary.strongest.shortName, note: signed(data.summary.strongest.metrics.preference20d, 1, " pt"), icon: ArrowUpRight, color: "#d49a54" },
              { label: "偏好落后", value: data.summary.weakest.shortName, note: signed(data.summary.weakest.metrics.preference20d, 1, " pt"), icon: ArrowDownRight, color: "#55a8a1" },
              { label: "因子可用", value: `${data.factorModel.readyMarkets}/${data.summary.marketCount}`, note: `${data.factorModel.windowDays} 日回归`, icon: CircleGauge, color: "#8ba9b0" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="bg-[#0b0f10] p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-wider text-[#657078]">{item.label}</p>
                    <Icon size={15} style={{ color: item.color }} />
                  </div>
                  <p className="mt-3 font-mono text-2xl font-semibold" style={{ color: item.color }}>{item.value}</p>
                  <p className="mt-1 text-[10px] text-[#616b72]">{item.note}</p>
                </div>
              );
            })}
          </section>

          <section className="mb-9" aria-labelledby="factor-title">
            <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#5f6970]">Common factors</p>
                <h2 id="factor-title" className="mt-2 text-2xl font-semibold text-white">20 日共同因子脉冲</h2>
              </div>
              <span className="text-[10px] text-[#667077]">状态 {data.factorModel.status}</span>
            </div>
            <div className="grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
              {data.factorModel.commonFactors.map((factor) => (
                <div key={factor.id} className="bg-[#0b0f10] px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[11px] text-[#89939a]">{factor.label}</span>
                    <span className="text-[9px] text-[#515a60]">{factor.symbol}</span>
                  </div>
                  <p className="mt-2 font-mono text-sm" style={{ color: tone(factor.move20d) }}>{factorValue(factor.move20d, factor.unit)}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="market-table-title">
            <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#5f6970]">Regional comparison</p>
                <h2 id="market-table-title" className="mt-2 text-2xl font-semibold text-white">区域市场对照</h2>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {(["preference", "return20d", "volume"] as SortKey[]).map((key) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setSortKey(key)}
                    className="h-8 shrink-0 border px-3 text-[10px] transition-colors"
                    style={{
                      color: sortKey === key ? "#f2f3f4" : "#727c83",
                      borderColor: sortKey === key ? "rgba(212,154,84,0.35)" : "rgba(255,255,255,0.08)",
                      background: sortKey === key ? "rgba(212,154,84,0.07)" : "transparent",
                    }}
                  >
                    {key === "preference" ? "偏好排序" : key === "return20d" ? "涨幅排序" : "量能排序"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="区域筛选">
              {regions.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setRegion(item)}
                  className="h-8 shrink-0 px-3 text-[10px] transition-colors"
                  style={{ color: region === item ? "#d49a54" : "#68737b", background: region === item ? "rgba(212,154,84,0.07)" : "transparent" }}
                >
                  {item}
                </button>
              ))}
            </div>

            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-xs">
                  <thead className="border-b border-white/[0.08] bg-white/[0.02] text-[10px] uppercase tracking-wider text-[#59636a]">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">市场</th>
                      <th className="px-3 py-3 text-right font-medium">1日</th>
                      <th className="px-3 py-3 text-right font-medium">5日</th>
                      <th className="px-3 py-3 text-right font-medium">20日</th>
                      <th className="px-3 py-3 text-right font-medium">20日偏好</th>
                      <th className="px-3 py-3 text-right font-medium">相对 ACWI</th>
                      <th className="px-3 py-3 text-right font-medium">量比</th>
                      <th className="px-4 py-3 text-left font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {markets.map((market) => (
                      <tr key={market.id} className="transition-colors hover:bg-white/[0.025]">
                        <td className="px-4 py-3.5">
                          <p className="text-[#d8dcdf]">{market.name}</p>
                          <p className="mt-1 text-[10px] text-[#59636a]">{market.symbol} · {market.region} · {market.asOf}</p>
                        </td>
                        {[market.return1d, market.return5d, market.return20d, market.metrics.preference20d, market.metrics.relativeReturn20d].map((value, index) => (
                          <td key={index} className="px-3 py-3.5 text-right font-mono" style={{ color: tone(value) }}>
                            {signed(value, index === 3 ? 2 : 1, index === 3 ? " pt" : "%")}
                          </td>
                        ))}
                        <td className="px-3 py-3.5 text-right font-mono text-[#929ba1]">{market.volumeRatio.toFixed(2)}x</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-2 text-[11px] text-[#a3abb0]">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone(market.flowScore) }} />
                            {market.metrics.regime}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          <section className="mt-8 grid gap-5 border-y border-white/[0.08] py-5 md:grid-cols-3" aria-label="分析层级">
            {[
              { icon: BarChart3, title: "共同因子", text: "ACWI、美元、利率、VIX 与行业相对收益解释全球同步波动。" },
              { icon: ArrowUpRight, title: "国家超额", text: "模型残差与相对 ACWI 表现用于识别值得继续调查的区域。" },
              { icon: CircleGauge, title: "证据确认", text: "价格代理只负责筛选，真实账本与持仓变化负责最终确认。" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-3">
                  <Icon size={15} className="mt-0.5 shrink-0 text-[#748087]" />
                  <div>
                    <p className="text-xs text-[#c2c8cc]">{item.title}</p>
                    <p className="mt-1.5 text-[11px] leading-5 text-[#68737b]">{item.text}</p>
                  </div>
                </div>
              );
            })}
          </section>

          <p className="mt-5 text-[10px] leading-5 text-[#59636a]">数据源：{data.source}。{data.methodology}</p>
        </>
      ) : loading ? (
        <div className="grid h-80 place-items-center border-y border-white/[0.08] text-sm text-[#68737b]">正在读取市场快照...</div>
      ) : null}
    </div>
  );
}