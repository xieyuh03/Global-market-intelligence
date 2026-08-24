"use client";

import {
  ChartNoAxesCombined,
  CircleGauge,
  ScanSearch,
} from "lucide-react";
import Card from "@/components/ui/Card";

type FactorContribution = {
  id: string;
  label: string;
  symbol: string;
  category: "global" | "macro" | "sector" | "currency";
  unit: "percent" | "basis_points";
  beta: number;
  move20d: number;
  contribution20d: number;
};

type MarketDecomposition = {
  marketId: string;
  marketName: string;
  status: "ready" | "insufficient";
  sampleSize: number;
  windowDays: number;
  rSquared: number | null;
  confidence: "high" | "medium" | "low" | "unavailable";
  actual20d: number | null;
  explained20d: number | null;
  residual20d: number | null;
  baseline20d: number | null;
  dominantFactorId: string | null;
  factors: FactorContribution[];
};

export type GlobalFactorModel = {
  status: "ready" | "partial" | "unavailable";
  methodology: string;
  windowDays: number;
  readyMarkets: number;
  commonFactors: Array<{
    id: string;
    label: string;
    symbol: string;
    category: FactorContribution["category"];
    unit: FactorContribution["unit"];
    asOf: string | null;
    move20d: number;
  }>;
  markets: MarketDecomposition[];
  errors: string[];
};

function signed(value: number | null, digits = 2, suffix = "%") {
  if (value == null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`;
}

function directionColor(value: number | null) {
  if (value == null) return "#737d87";
  if (value > 0) return "#d49a54";
  if (value < 0) return "#55a8a1";
  return "#8b949e";
}

function confidenceLabel(confidence: MarketDecomposition["confidence"]) {
  if (confidence === "high") return "高";
  if (confidence === "medium") return "中";
  if (confidence === "low") return "低";
  return "不可用";
}

function factorMove(value: number, unit: FactorContribution["unit"]) {
  return signed(value, unit === "basis_points" ? 0 : 2, unit === "basis_points" ? " bp" : "%");
}

function interpretation(model: MarketDecomposition, dominant: FactorContribution | undefined) {
  if (model.status !== "ready" || model.actual20d == null || model.residual20d == null) {
    return "对齐样本不足，暂不输出归因判断。";
  }
  const residualLarge = Math.abs(model.residual20d) >= Math.max(1.5, Math.abs(model.actual20d) * 0.35);
  if (model.confidence === "low") {
    return "拟合度偏低，当前因子只能提供排查方向，不能据此归因。";
  }
  if (residualLarge) {
    return `共同因子未能解释 ${signed(model.residual20d)}，优先检查本地资金、政策和行业结构。`;
  }
  return dominant
    ? `${dominant.label}是近20日最大可观察贡献，剩余未解释部分为 ${signed(model.residual20d)}。`
    : "共同因子解释占主导，未发现显著国家残差。";
}

export default function GlobalFactorAttributionPanel({
  model,
  selectedMarketId,
  onSelectMarket,
}: {
  model: GlobalFactorModel;
  selectedMarketId: string | null;
  onSelectMarket: (marketId: string) => void;
}) {
  const selected = model.markets.find((market) => market.marketId === selectedMarketId)
    ?? model.markets.find((market) => market.status === "ready")
    ?? null;
  const contributions = [...(selected?.factors ?? [])]
    .sort((left, right) => Math.abs(right.contribution20d) - Math.abs(left.contribution20d));
  const dominant = contributions[0];
  const maxContribution = Math.max(1, ...contributions.map((factor) => Math.abs(factor.contribution20d)));
  const residualRank = [...model.markets]
    .filter((market) => market.status === "ready" && market.residual20d != null)
    .sort((left, right) => (right.residual20d ?? 0) - (left.residual20d ?? 0));

  return (
    <section className="mt-8" aria-label="全球共同因子拆解">
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="mb-2 flex items-center gap-2 text-gray-500">
            <ScanSearch size={16} />
            <span className="text-[10px] uppercase tracking-[0.2em]">Factor decomposition</span>
          </div>
          <h2 className="text-2xl font-semibold text-white">共同因子拆解</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-gray-500">
            先解释全球股票、美元、利率、波动率、行业与汇率，再把残差交给本地资金和事件层继续验证。
          </p>
        </div>
        <span className="rounded border border-white/[0.08] px-2.5 py-1 text-[10px] text-gray-500">
          {model.windowDays} 日岭回归 · {model.readyMarkets} 个市场可用
        </span>
      </div>

      <div className="mb-6 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {model.commonFactors.map((factor) => (
          <div key={factor.id} className="min-w-0 bg-[#0b0d0f] px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[11px] text-gray-500">{factor.label}</span>
              <span className="text-[9px] uppercase text-gray-700">{factor.symbol}</span>
            </div>
            <p className="mt-2 font-mono text-sm" style={{ color: directionColor(factor.move20d) }}>
              {factorMove(factor.move20d, factor.unit)}
            </p>
          </div>
        ))}
      </div>

      {selected ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-white">{selected.marketName} · 20日收益归因</p>
                <p className="mt-1 text-[10px] text-gray-600">样本 {selected.sampleSize} 日 · 置信度 {confidenceLabel(selected.confidence)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-600">拟合度 R²</p>
                <p className="mt-1 font-mono text-sm text-gray-300">{selected.rSquared == null ? "--" : `${(selected.rSquared * 100).toFixed(0)}%`}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-px bg-white/[0.07]">
              {[
                { label: "实际收益", value: selected.actual20d },
                { label: "因子解释", value: selected.explained20d },
                { label: "国家残差", value: selected.residual20d },
              ].map((item) => (
                <div key={item.label} className="bg-[#0b0d0f] px-4 py-3">
                  <p className="text-[10px] text-gray-600">{item.label}</p>
                  <p className="mt-1.5 font-mono text-base" style={{ color: directionColor(item.value) }}>{signed(item.value)}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3 px-5 py-5">
              {contributions.map((factor) => {
                const width = Math.max(2, Math.abs(factor.contribution20d) / maxContribution * 48);
                const positive = factor.contribution20d >= 0;
                return (
                  <div key={factor.id} className="grid grid-cols-[105px_minmax(140px,1fr)_62px] items-center gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] text-gray-400">{factor.label}</p>
                      <p className="mt-0.5 text-[9px] text-gray-700">β {factor.beta.toFixed(2)}</p>
                    </div>
                    <div className="relative h-2 rounded-sm bg-white/[0.035]">
                      <span className="absolute bottom-[-3px] left-1/2 top-[-3px] w-px bg-white/[0.12]" />
                      <span
                        className="absolute top-0 h-2 rounded-sm"
                        style={{
                          background: directionColor(factor.contribution20d),
                          left: positive ? "50%" : `${50 - width}%`,
                          width: `${width}%`,
                        }}
                      />
                    </div>
                    <span className="text-right font-mono text-[11px]" style={{ color: directionColor(factor.contribution20d) }}>
                      {signed(factor.contribution20d)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-white/[0.07] px-5 py-4">
              <p className="text-xs leading-5 text-gray-400">{interpretation(selected, dominant)}</p>
            </div>
          </Card>

          <div className="space-y-6">
            <Card padding="md">
              <div className="mb-4 flex items-center gap-2 text-gray-400">
                <CircleGauge size={15} />
                <span className="text-xs">国家残差排名</span>
              </div>
              <p className="mb-4 text-[11px] leading-5 text-gray-600">正残差代表跑赢模型，负残差代表跑输模型；它是待调查线索，不是资金结论。</p>
              <div className="space-y-1">
                {residualRank.map((market, index) => (
                  <button
                    type="button"
                    key={market.marketId}
                    onClick={() => onSelectMarket(market.marketId)}
                    className="grid w-full grid-cols-[22px_minmax(0,1fr)_58px] items-center gap-2 rounded px-1 py-1.5 text-left hover:bg-white/[0.03]"
                  >
                    <span className="font-mono text-[9px] text-gray-700">{String(index + 1).padStart(2, "0")}</span>
                    <span className={market.marketId === selected.marketId ? "truncate text-xs text-white" : "truncate text-xs text-gray-500"}>{market.marketName}</span>
                    <span className="text-right font-mono text-[11px]" style={{ color: directionColor(market.residual20d) }}>{signed(market.residual20d)}</span>
                  </button>
                ))}
              </div>
            </Card>

            <div className="flex items-start gap-3 border-y border-white/[0.08] py-4">
              <ChartNoAxesCombined size={15} className="mt-0.5 shrink-0 text-gray-600" />
              <div>
                <p className="text-xs text-gray-400">分析边界</p>
                <p className="mt-1.5 text-[11px] leading-5 text-gray-600">{model.methodology}</p>
                {model.status === "partial" ? <p className="mt-2 text-[10px] text-[#d49a54]">{model.errors.length} 个因子源降级，结果按可用因子计算。</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid h-44 place-items-center border-y border-white/[0.08] text-sm text-gray-600">
          共同因子对齐样本不足
        </div>
      )}
    </section>
  );
}