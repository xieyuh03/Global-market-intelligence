"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Database,
  ShieldAlert,
} from "lucide-react";
import Card from "@/components/ui/Card";
import { capitalLedgerUrl, withCurrentFreshness } from "@/lib/data-source";

export type GlobalComparisonMarket = {
  id: string;
  name: string;
  shortName: string;
  symbol: string;
  region: string;
  return5d: number;
  return20d: number;
  volumeRatio: number;
  flowScore: number;
  signal: string;
  metrics: {
    preference5d: number;
    preference20d: number;
    preference60d: number;
    preference120d: number;
    persistence20d: number;
    acceleration: number;
    streak: number;
    relativeReturn20d: number;
    regime: string;
  };
};

type LedgerMarket = "CN-A" | "HK";

type LedgerSnapshot = {
  market: LedgerMarket;
  latestDate: string | null;
  analysis: {
    headline: string;
    summary: string;
  };
  quality: {
    validCoverage: number;
    partialCoverage: number;
    nonConflictRatio: number;
    freshness: {
      ageDays: number | null;
      status: "fresh" | "stale" | "unavailable";
    };
  };
};

type QuadrantKey = "distribution" | "confirmed" | "retreat" | "absorption";

type QuadrantDefinition = {
  key: QuadrantKey;
  title: string;
  condition: string;
  detail: string;
  tone: string;
};

const QUADRANTS: QuadrantDefinition[] = [
  {
    key: "distribution",
    title: "本地接替 / 高位派发",
    condition: "偏好撤离 · 价格上涨",
    detail: "相对偏好走弱但价格仍涨，需确认本地资金接力还是高位派发。",
    tone: "#d49a54",
  },
  {
    key: "confirmed",
    title: "趋势确认",
    condition: "偏好增配 · 价格上涨",
    detail: "相对偏好与绝对价格同向，趋势获得双重代理确认。",
    tone: "#e7685d",
  },
  {
    key: "retreat",
    title: "撤退确认",
    condition: "偏好撤离 · 价格下跌",
    detail: "相对偏好和价格同时转弱，风险资金撤退代理最一致。",
    tone: "#39a77c",
  },
  {
    key: "absorption",
    title: "承接 / 流入无效",
    condition: "偏好增配 · 价格下跌",
    detail: "相对偏好改善但价格未确认，观察承接是否转化为反弹。",
    tone: "#55a8a1",
  },
];

function signed(value: number, digits = 1, suffix = "%") {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`;
}

function directionColor(value: number) {
  if (value > 0) return "#e7685d";
  if (value < 0) return "#55a8a1";
  return "#8b949e";
}

function quadrantFor(market: GlobalComparisonMarket): QuadrantKey {
  const preferenceUp = market.metrics.preference20d >= 0;
  const priceUp = market.return20d >= 0;
  if (preferenceUp && priceUp) return "confirmed";
  if (preferenceUp && !priceUp) return "absorption";
  if (!preferenceUp && priceUp) return "distribution";
  return "retreat";
}

function ledgerCode(market: GlobalComparisonMarket): LedgerMarket | null {
  if (market.id === "cn") return "CN-A";
  if (market.id === "hk") return "HK";
  return null;
}

function ledgerEvidenceState(ledger: LedgerSnapshot | null | undefined) {
  if (!ledger || ledger.quality.freshness.status === "unavailable") return "unavailable" as const;
  if (ledger.quality.freshness.status === "stale") return "stale" as const;
  if (ledger.quality.validCoverage < 70 || ledger.quality.nonConflictRatio < 99) return "degraded" as const;
  return "verified" as const;
}

function ledgerFallbackReason(ledger: LedgerSnapshot | null | undefined) {
  const state = ledgerEvidenceState(ledger);
  if (state === "stale") return `账本过期 ${ledger?.quality.freshness.ageDays ?? "--"} 天`;
  if (state === "degraded") return `账本质量未过门 · 有效 ${ledger?.quality.validCoverage ?? 0}%`;
  return "等待投资者分类与持仓数据";
}

export default function GlobalComparisonPanels({
  markets,
  selectedMarketId,
  onSelectMarket,
}: {
  markets: GlobalComparisonMarket[];
  selectedMarketId: string | null;
  onSelectMarket: (market: GlobalComparisonMarket) => void;
}) {
  const [ledgers, setLedgers] = useState<Partial<Record<LedgerMarket, LedgerSnapshot>>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled(
      (["CN-A", "HK"] as LedgerMarket[]).map(async (market) => {
        const response = await fetch(capitalLedgerUrl(market), { cache: "no-store" });
        if (!response.ok) throw new Error(`${market}: ${response.status}`);
        return withCurrentFreshness(await response.json() as LedgerSnapshot);
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Partial<Record<LedgerMarket, LedgerSnapshot>> = {};
      for (const result of results) {
        if (result.status === "fulfilled") next[result.value.market] = result.value;
      }
      setLedgers(next);
    });
    return () => { cancelled = true; };
  }, []);

  const ranked = useMemo(
    () => [...markets].sort((left, right) => right.metrics.preference20d - left.metrics.preference20d),
    [markets],
  );

  const quadrants = useMemo(() => {
    const grouped: Record<QuadrantKey, GlobalComparisonMarket[]> = {
      distribution: [],
      confirmed: [],
      retreat: [],
      absorption: [],
    };
    for (const market of markets) grouped[quadrantFor(market)].push(market);
    for (const key of Object.keys(grouped) as QuadrantKey[]) {
      grouped[key].sort((left, right) => Math.abs(right.metrics.preference20d) - Math.abs(left.metrics.preference20d));
    }
    return grouped;
  }, [markets]);

  const transmission = useMemo(() => {
    if (!markets.length) return null;
    const averageReturn20d = markets.reduce((sum, market) => sum + market.return20d, 0) / markets.length;
    const averagePreference20d = markets.reduce((sum, market) => sum + market.metrics.preference20d, 0) / markets.length;
    const positiveBreadth = markets.filter((market) => market.return20d > 0).length;
    const excessRank = [...markets].sort((left, right) => right.metrics.relativeReturn20d - left.metrics.relativeReturn20d);
    const divergences = markets
      .filter((market) => Math.sign(market.metrics.preference20d) !== Math.sign(market.return20d))
      .sort((left, right) => Math.abs(right.metrics.preference20d) - Math.abs(left.metrics.preference20d));
    return {
      averageReturn20d,
      averagePreference20d,
      positiveBreadth,
      leaders: excessRank.slice(0, 3),
      laggards: excessRank.slice(-2).reverse(),
      divergences,
    };
  }, [markets]);

  if (!markets.length) return null;

  return (
    <section className="mt-8 space-y-8" aria-label="全球市场比较与传导">
      <div>
        <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600">Country comparison</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">国家比较矩阵</h2>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              统一比较区域 ETF 相对 ACWI 的偏好代理、绝对价格与成交量，不横向比较不同币种的资金金额。
            </p>
          </div>
          <span className="rounded border border-[#d49a54]/25 px-2.5 py-1 text-[10px] text-[#d49a54]">代理口径 · 非基金申赎</span>
        </div>

        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-xs">
              <thead className="border-b border-white/[0.08] bg-white/[0.02] text-[10px] uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">市场</th>
                  <th className="px-3 py-3 text-right font-medium">20日偏好</th>
                  <th className="px-3 py-3 text-right font-medium">20日价格</th>
                  <th className="px-3 py-3 text-right font-medium">相对 ACWI</th>
                  <th className="px-3 py-3 text-right font-medium">正偏好日</th>
                  <th className="px-3 py-3 text-right font-medium">加速度</th>
                  <th className="px-3 py-3 text-right font-medium">量能</th>
                  <th className="px-4 py-3 text-left font-medium">证据层</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {ranked.map((market) => {
                  const code = ledgerCode(market);
                  const ledger = code ? ledgers[code] : null;
                  const evidenceState = ledgerEvidenceState(ledger);
                  const active = selectedMarketId === market.id;
                  return (
                    <tr
                      key={market.id}
                      onClick={() => onSelectMarket(market)}
                      className="cursor-pointer transition-colors hover:bg-white/[0.035]"
                      style={{ background: active ? "rgba(255,255,255,0.05)" : undefined }}
                    >
                      <td className="px-4 py-3">
                        <p className="text-gray-200">{market.name}</p>
                        <p className="mt-1 text-[10px] text-gray-700">{market.symbol} · {market.region}</p>
                      </td>
                      <td className="px-3 py-3 text-right font-mono" style={{ color: directionColor(market.metrics.preference20d) }}>{signed(market.metrics.preference20d, 2, " pt")}</td>
                      <td className="px-3 py-3 text-right font-mono" style={{ color: directionColor(market.return20d) }}>{signed(market.return20d)}</td>
                      <td className="px-3 py-3 text-right font-mono" style={{ color: directionColor(market.metrics.relativeReturn20d) }}>{signed(market.metrics.relativeReturn20d)}</td>
                      <td className="px-3 py-3 text-right font-mono text-gray-400">{market.metrics.persistence20d.toFixed(0)}%</td>
                      <td className="px-3 py-3 text-right font-mono" style={{ color: directionColor(market.metrics.acceleration) }}>{signed(market.metrics.acceleration, 3, "")}</td>
                      <td className="px-3 py-3 text-right font-mono text-gray-400">{market.volumeRatio.toFixed(2)}x</td>
                      <td className="px-4 py-3">
                        {evidenceState === "verified" ? (
                          <div>
                            <p className="text-[11px] text-[#55a8a1]">真实账本确认</p>
                            <p className="mt-1 text-[10px] text-gray-600">有效 {ledger?.quality.validCoverage ?? 0}% · {ledger?.latestDate ?? "无日期"}</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-[11px] text-[#d49a54]">ETF 价格代理</p>
                            <p className="mt-1 text-[10px] text-gray-600">{ledgerFallbackReason(ledger)}</p>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div>
        <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600">Preference × price</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">资金方向 × 价格四象限</h2>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              横轴是相对偏好代理，纵轴是绝对价格表现；两者共享价格信息，只用于筛选，不视为独立因果验证。
            </p>
          </div>
          <span className="text-[10px] text-gray-600">观察窗口：20 个交易日</span>
        </div>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-2">
          {QUADRANTS.map((quadrant) => (
            <div key={quadrant.key} className="min-h-48 bg-[#0b0d0f] p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: quadrant.tone }}>{quadrant.title}</p>
                  <p className="mt-1 text-[10px] text-gray-600">{quadrant.condition}</p>
                </div>
                {quadrant.key === "confirmed" || quadrant.key === "distribution"
                  ? <ArrowUpRight size={17} style={{ color: quadrant.tone }} />
                  : <ArrowDownRight size={17} style={{ color: quadrant.tone }} />}
              </div>
              <p className="mb-4 text-[11px] leading-5 text-gray-500">{quadrant.detail}</p>
              <div className="flex flex-wrap gap-2">
                {quadrants[quadrant.key].length ? quadrants[quadrant.key].map((market) => (
                  <button
                    type="button"
                    key={market.id}
                    onClick={() => onSelectMarket(market)}
                    className="rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
                    style={{ borderColor: selectedMarketId === market.id ? quadrant.tone : "rgba(255,255,255,0.08)" }}
                  >
                    <span className="text-[11px] text-gray-300">{market.shortName}</span>
                    <span className="ml-2 text-[10px] font-mono" style={{ color: directionColor(market.return20d) }}>{signed(market.return20d)}</span>
                    <span className="ml-1 text-[10px] font-mono text-gray-600">/ {signed(market.metrics.preference20d, 1, "pt")}</span>
                  </button>
                )) : <span className="text-xs text-gray-700">当前没有市场落入该象限</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {transmission ? (
        <div>
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600">Transmission watch</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">跨市场传导观察</h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-gray-500">
              共同因子已在上方完成回归剥离；这里保留从全球方向、国家超额到真实资金账本的验证顺序。
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card padding="md">
              <div className="mb-4 flex items-center gap-2 text-gray-400"><Activity size={15} /><span className="text-xs">第一层 · 全球共同方向</span></div>
              <p className="text-xl font-semibold" style={{ color: directionColor(transmission.averageReturn20d) }}>
                {transmission.positiveBreadth}/{markets.length} 市场上涨
              </p>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                20日平均价格 {signed(transmission.averageReturn20d)}，平均相对偏好 {signed(transmission.averagePreference20d, 2, " pt")}。这是共同风险偏好的代理，不是跨境资金总额。
              </p>
            </Card>

            <Card padding="md">
              <div className="mb-4 flex items-center gap-2 text-gray-400"><ArrowUpRight size={15} /><span className="text-xs">第二层 · 国家超额</span></div>
              <div className="space-y-2.5">
                {transmission.leaders.map((market) => (
                  <button type="button" key={market.id} onClick={() => onSelectMarket(market)} className="flex w-full items-center justify-between gap-3 text-left">
                    <span className="text-xs text-gray-400">{market.shortName}</span>
                    <span className="text-xs font-mono text-[#d49a54]">{signed(market.metrics.relativeReturn20d)}</span>
                  </button>
                ))}
                <div className="border-t border-white/[0.07] pt-2.5">
                  {transmission.laggards.map((market) => (
                    <button type="button" key={market.id} onClick={() => onSelectMarket(market)} className="flex w-full items-center justify-between gap-3 py-1 text-left">
                      <span className="text-xs text-gray-500">{market.shortName}</span>
                      <span className="text-xs font-mono text-[#55a8a1]">{signed(market.metrics.relativeReturn20d)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            <Card padding="md">
              <div className="mb-4 flex items-center gap-2 text-gray-400"><Database size={15} /><span className="text-xs">第三层 · 真实资金确认</span></div>
              <div className="space-y-3">
                {(["CN-A", "HK"] as LedgerMarket[]).map((code) => {
                  const ledger = ledgers[code];
                  const evidenceState = ledgerEvidenceState(ledger);
                  return (
                    <div key={code} className="border-l-2 pl-3" style={{ borderColor: evidenceState === "verified" ? "#55a8a1" : "#d49a54" }}>
                      <p className="text-[10px] text-gray-600">{code === "CN-A" ? "A股杠杆账本" : "港股南向账本"}</p>
                      <p className="mt-1 text-xs text-gray-300">
                        {evidenceState === "verified" ? ledger?.analysis.headline : `${ledgerFallbackReason(ledger)}，当前不参与确认`}
                      </p>
                    </div>
                  );
                })}
                <div className="flex items-start gap-2 border-t border-white/[0.07] pt-3 text-[11px] leading-5 text-gray-600">
                  <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                  <span>只有真实跨境交易或持仓变化通过质量门后，地图才生成国家间资金箭头。</span>
                </div>
              </div>
            </Card>
          </div>

          {transmission.divergences.length ? (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#d49a54]/20 bg-[#d49a54]/[0.04] px-4 py-3">
              <ShieldAlert size={15} className="mt-0.5 shrink-0 text-[#d49a54]" />
              <p className="text-xs leading-5 text-gray-500">
                <span className="text-[#d49a54]">量价分歧：</span>
                {transmission.divergences.map((market) => market.shortName).join("、")} 的相对偏好与绝对价格方向相反，优先等待后续价格或真实资金确认。
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
