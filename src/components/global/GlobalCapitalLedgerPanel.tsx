"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Database,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import Card from "@/components/ui/Card";
import {
  capitalLedgerUrl,
  capitalRefreshUrl,
  publicSnapshotMode,
  withCurrentFreshness,
} from "@/lib/data-source";

type MarketCode = "CN-A" | "HK";

type CapitalPoint = {
  date: string;
  value: number;
  qualityStatus: string;
  evidence: string;
};

type CapitalMetric = {
  key: string;
  label: string;
  ledger: string;
  description: string;
  basis: string;
  latest: null | {
    date: string;
    value: number;
    unit: string;
    evidence: string;
    evidenceLabel: string;
    qualityStatus: string;
    qualityFlags: string[];
    regime: string;
  };
  points: CapitalPoint[];
};

type CapitalResponse = {
  market: MarketCode;
  latestDate: string | null;
  dateCount: number;
  analysis: {
    headline: string;
    summary: string;
    metrics: Record<string, number | null>;
    conclusions: Array<{
      title: string;
      status: string;
      text: string;
      evidenceKeys: string[];
    }>;
  };
  coverage: Array<{ ledger: string; available: number; expected: number; status: string }>;
  metrics: CapitalMetric[];
  quality: {
    counts: Record<string, number>;
    validCoverage: number;
    partialCoverage: number;
    nonConflictRatio: number;
    usableRatio: number;
    freshness: {
      ageDays: number | null;
      status: "fresh" | "stale" | "unavailable";
    };
  };
  gaps: Array<{ key: string; label: string; status: string; since?: string; reason: string }>;
  sources: Array<{
    id: string;
    name: string;
    organization: string;
    tier: string;
    frequency: string;
    url: string;
    metadata: Record<string, unknown>;
  }>;
};

type LedgerChartPoint = {
  date: string;
  daily: number;
  balance: number | null;
  cumulative: number | null;
};

const LEDGER_NAMES: Record<string, string> = {
  capacity: "市场容量",
  activity: "交易速度",
  leverage: "杠杆空头",
  investor: "资金来源",
  supply: "股票供给",
  crossborder: "跨境流动",
};

const STATUS_COLORS: Record<string, string> = {
  expanding: "#d49a54",
  contracting: "#55a8a1",
  neutral: "#9199a3",
  partial: "#a88d60",
  unavailable: "#8f9aa5",
  live: "#55a8a1",
  planned: "#87939f",
};

const TOOLTIP_STYLE = {
  background: "#111518",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "#d5d8dc",
  fontSize: 12,
};

function formatCapital(value: number | null | undefined, unit = "CNY", showPositiveSign = false) {
  if (value == null || !Number.isFinite(value)) return "--";
  const sign = value < 0 ? "-" : value > 0 && showPositiveSign ? "+" : "";
  const absolute = Math.abs(value);
  const suffix = unit === "HKD" ? "港元" : unit === "CNY" ? "元" : "";
  if (absolute >= 1e12) return `${sign}${(absolute / 1e12).toFixed(2)}万亿${suffix}`;
  if (absolute >= 1e8) return `${sign}${(absolute / 1e8).toFixed(1)}亿${suffix}`;
  if (unit === "percent") return `${value.toFixed(2)}%`;
  if (unit === "count") return value.toLocaleString("zh-CN");
  return `${sign}${absolute.toLocaleString("zh-CN")}${suffix}`;
}

function statusColor(status: string) {
  return STATUS_COLORS[status] ?? "#aab4be";
}

function metricMap(metrics: CapitalMetric[]) {
  return new Map(metrics.map((metric) => [metric.key, metric]));
}

function latestCard(metric: CapitalMetric | undefined, fallbackLabel?: string) {
  return {
    label: fallbackLabel ?? metric?.label ?? "--",
    value: metric?.latest ? formatCapital(metric.latest.value, metric.latest.unit) : "--",
    note: metric?.latest ? `${metric.latest.evidenceLabel} · ${metric.latest.date}` : "等待接入",
    status: metric?.latest?.qualityStatus ?? "unavailable",
  };
}

export default function GlobalCapitalLedgerPanel({ preferredMarket }: { preferredMarket?: MarketCode | null }) {
  const [market, setMarket] = useState<MarketCode>(preferredMarket ?? "CN-A");
  const [data, setData] = useState<CapitalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (preferredMarket) setMarket(preferredMarket);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [preferredMarket]);

  const load = useCallback(async (target: MarketCode) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(capitalLedgerUrl(target), { cache: "no-store" });
      if (!response.ok) throw new Error("国家资金账本暂时不可用");
      setData(withCurrentFreshness(await response.json() as CapitalResponse));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资金账本加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(market), 0);
    return () => window.clearTimeout(timer);
  }, [load, market]);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch(capitalRefreshUrl(), { method: "POST" });
      if (!response.ok) throw new Error("官方数据刷新失败");
      await load(market);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "官方数据刷新失败");
    } finally {
      setRefreshing(false);
    }
  }

  const metrics = useMemo(() => metricMap(data?.metrics ?? []), [data?.metrics]);

  const keyCards = useMemo(() => {
    if (!data) return [];
    if (market === "CN-A") {
      const margin20 = data.analysis.metrics.marginChange20;
      return [
        latestCard(metrics.get("market.total_cap"), "总市值"),
        latestCard(metrics.get("market.float_cap"), "流通市值"),
        latestCard(metrics.get("activity.turnover"), "全市场成交额"),
        latestCard(metrics.get("leverage.margin_balance"), "融资余额"),
        {
          label: "近20日融资变化",
          value: formatCapital(margin20, "CNY", true),
          note: `按官方余额差计算 · ${data.analysis.metrics.sampleCount ?? 0}个变化日`,
          status: (margin20 ?? 0) >= 0 ? "expanding" : "contracting",
        },
      ];
    }
    const latestNet = metrics.get("crossborder.southbound_net_buy")?.latest;
    return [
      latestCard(metrics.get("crossborder.southbound_buy"), "南向买入"),
      latestCard(metrics.get("crossborder.southbound_sell"), "南向卖出"),
      latestCard(metrics.get("crossborder.southbound_turnover"), "南向成交额"),
      {
        label: "当日南向净买入",
        value: latestNet ? formatCapital(latestNet.value, "HKD", true) : "--",
        note: latestNet ? `${latestNet.evidenceLabel} · ${latestNet.date}` : "等待接入",
        status: (latestNet?.value ?? 0) >= 0 ? "expanding" : "contracting",
      },
      {
        label: "近20日累计净买入",
        value: formatCapital(data.analysis.metrics.southboundNet20, "HKD", true),
        note: `${data.analysis.metrics.sampleCount ?? 0}个有效交易日`,
        status: (data.analysis.metrics.southboundNet20 ?? 0) >= 0 ? "expanding" : "contracting",
      },
    ];
  }, [data, market, metrics]);

  const chartData = useMemo<LedgerChartPoint[]>(() => {
    if (!data) return [];
    if (market === "CN-A") {
      const balances = metrics.get("leverage.margin_balance")?.points.filter((point) => point.qualityStatus === "valid") ?? [];
      const changes = new Map((metrics.get("leverage.margin_balance_change")?.points ?? []).map((point) => [point.date, point]));
      return balances.map((point) => ({
        date: point.date.slice(5),
        balance: +(point.value / 1e12).toFixed(3),
        daily: +((changes.get(point.date)?.value ?? 0) / 1e8).toFixed(1),
        cumulative: null,
      }));
    }
    const points = metrics.get("crossborder.southbound_net_buy")?.points.filter((point) => point.qualityStatus === "valid") ?? [];
    let cumulative = 0;
    return points.map((point) => {
      cumulative += point.value;
      return {
        date: point.date.slice(5),
        daily: +(point.value / 1e8).toFixed(1),
        balance: null,
        cumulative: +(cumulative / 1e8).toFixed(1),
      };
    });
  }, [data, market, metrics]);

  return (
    <section className="mt-8" aria-label="国家市场资金账本">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <div className="flex items-center gap-2 mb-2 text-gray-500">
            <CircleDollarSign size={16} />
            <span className="text-[10px] uppercase tracking-[0.2em]">Country Capital Ledger</span>
          </div>
          <h2 className="text-2xl font-semibold text-white">国家市场资金账本</h2>
          <p className="text-xs text-gray-500 mt-2">容量、交易、杠杆和跨境分账记录，不把成交额或市值伪装成资金净流入。</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded-lg border border-white/10 bg-white/[0.03]">
            {(["CN-A", "HK"] as MarketCode[]).map((code) => (
              <button
                type="button"
                key={code}
                onClick={() => setMarket(code)}
                className="px-3 py-1.5 rounded-md text-xs transition-colors"
                style={{ background: market === code ? "rgba(255,255,255,0.10)" : "transparent", color: market === code ? "#fff" : "#a0abb5" }}
              >
                {code === "CN-A" ? "A股" : "港股"}
              </button>
            ))}
          </div>
          {publicSnapshotMode ? (
            <span className="px-2.5 py-2 text-[10px] text-gray-600 border border-white/[0.07] rounded-lg">只读快照</span>
          ) : (
            <button
              type="button"
              onClick={() => void refresh()}
              title="从交易所增量刷新最近14日"
              className="w-9 h-9 grid place-items-center rounded-lg border border-white/10 text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            </button>
          )}
        </div>
      </div>

      {error ? <div className="mb-4 px-4 py-3 rounded-lg border border-red-400/20 bg-red-400/[0.05] text-xs text-red-300">{error}</div> : null}

      {loading && !data ? (
        <div className="h-64 grid place-items-center border-y border-white/[0.08] text-sm text-gray-600">正在读取历史资金账本...</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-px rounded-xl overflow-hidden border border-white/10 bg-white/10">
            {keyCards.map((card, index) => (
              <div key={`${market}-${card.label}-${index}`} className="bg-[#0b0d0f] p-4 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">{card.label}</p>
                <p className="text-lg font-semibold font-mono truncate" style={{ color: statusColor(card.status) }}>{card.value}</p>
                <p className="text-[10px] text-gray-700 mt-2 truncate" title={card.note}>{card.note}</p>
              </div>
            ))}
          </div>

          <div className="grid xl:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.8fr)] gap-6 mt-6">
            <Card padding="none" className="overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-white">{market === "CN-A" ? "融资余额与每日变化" : "南向每日与累计净买入"}</p>
                  <p className="text-[10px] text-gray-600 mt-1">{data.dateCount} 个已收录交易日 · 数据截至 {data.latestDate}</p>
                </div>
                <span className="text-[10px]" style={{ color: (data.quality.counts.conflict ?? 0) > 0 ? "#e7685d" : "#55a8a1" }}>
                  {data.quality.counts.conflict ?? 0} 个恒等式冲突
                </span>
              </div>
              <div className="h-[320px] p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: "#a3adb7", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis yAxisId="left" tick={{ fill: "#a3adb7", fontSize: 10 }} axisLine={false} tickLine={false} width={55} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "#a3adb7", fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#8d96a0" }} />
                    <ReferenceLine yAxisId="right" y={0} stroke="rgba(255,255,255,0.16)" />
                    <Bar yAxisId="right" dataKey="daily" name={market === "CN-A" ? "融资余额变化(亿)" : "当日净买入(亿)"} fill="#8795a1" opacity={0.65} />
                    <Line yAxisId="left" type="monotone" dataKey={market === "CN-A" ? "balance" : "cumulative"} name={market === "CN-A" ? "融资余额(万亿)" : "累计净买入(亿)"} stroke="#d49a54" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="space-y-5">
              <div className="border-y border-white/[0.08]">
                <div className="py-4">
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">当前判断</p>
                  <p className="text-xl font-semibold" style={{ color: statusColor(data.analysis.conclusions[0]?.status) }}>{data.analysis.headline}</p>
                  <p className="text-xs text-gray-400 leading-5 mt-2">{data.analysis.summary}</p>
                </div>
                {data.analysis.conclusions.map((conclusion) => (
                  <div key={conclusion.title} className="py-3.5 border-t border-white/[0.06] grid grid-cols-[78px_1fr] gap-4">
                    <span className="text-xs text-gray-600">{conclusion.title}</span>
                    <span className="text-xs leading-5" style={{ color: statusColor(conclusion.status) }}>{conclusion.text}</span>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3 text-xs text-gray-400"><Database size={14} /><span>六本账覆盖</span></div>
                <div className="grid grid-cols-2 gap-2">
                  {data.coverage.map((item) => (
                    <div key={item.ledger} className="px-3 py-2.5 border border-white/[0.07] rounded-lg">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-gray-500">{LEDGER_NAMES[item.ledger] ?? item.ledger}</span>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor(item.status) }} />
                      </div>
                      <p className="text-[10px] text-gray-700 mt-1.5">{item.status === "live" ? `${item.available}/${item.expected} 已接入` : item.status === "partial" ? `${item.available}/${item.expected} 部分` : "待建设"}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mt-6">
            <div>
              <div className="flex items-center gap-2 mb-3 text-xs text-gray-400"><AlertTriangle size={14} /><span>数据缺口与制度边界</span></div>
              <div className="border-y border-white/[0.08] divide-y divide-white/[0.06]">
                {data.gaps.map((gap) => (
                  <div key={gap.key} className="py-3.5">
                    <div className="flex items-center justify-between gap-4 mb-1.5">
                      <p className="text-xs text-gray-300">{gap.label}</p>
                      <span className="text-[10px] text-gray-600">{gap.status}{gap.since ? ` · ${gap.since}起` : ""}</span>
                    </div>
                    <p className="text-[11px] text-gray-600 leading-5">{gap.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 text-xs text-gray-400"><CheckCircle2 size={14} /><span>来源与质量</span></div>
                <span className="text-[10px] text-gray-600">有效 {data.quality.counts.valid ?? 0} · 部分 {data.quality.counts.partial ?? 0} · 冲突 {data.quality.counts.conflict ?? 0}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { label: "有效覆盖", value: `${data.quality.validCoverage}%`, tone: "#55a8a1" },
                  { label: "部分覆盖", value: `${data.quality.partialCoverage}%`, tone: "#d49a54" },
                  { label: "无冲突率", value: `${data.quality.nonConflictRatio}%`, tone: data.quality.nonConflictRatio >= 99 ? "#55a8a1" : "#e7685d" },
                  {
                    label: "新鲜度",
                    value: data.quality.freshness.ageDays == null ? "无数据" : `${data.quality.freshness.ageDays} 天`,
                    tone: data.quality.freshness.status === "fresh" ? "#55a8a1" : data.quality.freshness.status === "stale" ? "#e7685d" : "#626b75",
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-white/[0.07] px-3 py-2.5">
                    <p className="text-[10px] text-gray-600">{item.label}</p>
                    <p className="mt-1 text-sm font-mono" style={{ color: item.tone }}>{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="border-y border-white/[0.08] divide-y divide-white/[0.06]">
                {data.sources.map((source) => (
                  <a
                    key={source.id}
                    href={source.url}
                    target={source.url.startsWith("http") ? "_blank" : undefined}
                    rel={source.url.startsWith("http") ? "noreferrer" : undefined}
                    className="py-3 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div>
                      <p className="text-xs text-gray-300">{source.name}</p>
                      <p className="text-[10px] text-gray-600 mt-1">{source.organization} · {source.frequency} · {source.tier}</p>
                    </div>
                    <ExternalLink size={13} className="text-gray-700 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}