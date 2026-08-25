"use client";

import {
  Activity,
  AlertTriangle,
  CircleGauge,
  Database,
  ExternalLink,
  MapPinned,
  Route,
  ShieldCheck,
} from "lucide-react";
import Card from "@/components/ui/Card";
import type {
  ContextCountry,
  ContextEvidence,
  ContextLayer,
  ContextLayerId,
  ContextTone,
} from "@/lib/global-intelligence/context-data";

const LAYER_TITLES: Record<ContextLayerId, string> = {
  gold: "黄金储备与价格驱动",
  energy: "能源价格与运输脆弱性",
  trade: "贸易活动与航线暴露",
  events: "高影响事件监测",
  geopolitics: "地缘风险传导",
};

const EVIDENCE_LABELS: Record<ContextEvidence, string> = {
  official: "官方数据",
  market_proxy: "市场代理",
  media_monitoring: "媒体监测",
  model: "结构模型",
};

const EVIDENCE_COLORS: Record<ContextEvidence, string> = {
  official: "#55a8a1",
  market_proxy: "#d49a54",
  media_monitoring: "#9ba7b3",
  model: "#b79bd1",
};

const TONE_COLORS: Record<ContextTone, string> = {
  positive: "#55a8a1",
  negative: "#e7685d",
  neutral: "#aab4be",
  warning: "#d49a54",
};

function formatNumber(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "--";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: digits });
}

function formatSigned(value: number | null, unit = "%") {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(unit === "bp" ? 0 : 1)}${unit}`;
}

function statusLabel(status: ContextLayer["status"]) {
  if (status === "ready") return "数据完整";
  if (status === "partial") return "部分降级";
  return "暂不可用";
}

function confidenceLabel(confidence: ContextLayer["decision"]["confidence"]) {
  if (confidence === "high") return "高";
  if (confidence === "medium") return "中";
  return "低";
}

function countryPrimary(country: ContextCountry) {
  if (country.secondaryValue != null && country.secondaryLabel?.includes("变化")) {
    return {
      label: country.secondaryLabel,
      value: `${country.secondaryValue > 0 ? "+" : ""}${formatNumber(country.secondaryValue, 2)} ${country.secondaryUnit ?? ""}`,
    };
  }
  return {
    label: country.metricLabel,
    value: `${formatNumber(country.metricValue, 1)} ${country.metricUnit}`,
  };
}

export default function GlobalContextPanel({
  layer,
  selectedCountryId,
  onSelectCountry,
}: {
  layer: ContextLayer;
  selectedCountryId: string;
  onSelectCountry: (countryId: string) => void;
}) {
  const rankedCountries = [...layer.countries].sort((left, right) => {
    const leftValue = left.signalValue;
    const rightValue = right.signalValue;
    if (leftValue == null && rightValue == null) return (right.metricValue ?? 0) - (left.metricValue ?? 0);
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    return Math.abs(rightValue) - Math.abs(leftValue);
  });
  const routes = [...layer.routes].sort((left, right) => (right.value ?? 0) - (left.value ?? 0));
  const selectedCountry = layer.countries.find((country) => country.countryId === selectedCountryId) ?? null;

  return (
    <section className="mt-8" aria-label={`${LAYER_TITLES[layer.id]}分析面板`}>
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600">Decision layer</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{LAYER_TITLES[layer.id]}</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-gray-500">{layer.decision.question}</p>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="border border-white/[0.12] px-2.5 py-1 text-gray-400">{statusLabel(layer.status)}</span>
          <span className="border border-white/[0.12] px-2.5 py-1 text-gray-400">置信度 {confidenceLabel(layer.decision.confidence)}</span>
          <span className="border border-white/[0.12] px-2.5 py-1 text-gray-400">截至 {layer.asOf}</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <Card padding="lg">
          <div className="flex items-start gap-3">
            <CircleGauge size={18} className="mt-0.5 shrink-0 text-[#d49a54]" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-600">当前结论</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{layer.decision.headline}</h3>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-300">{layer.decision.summary}</p>
            </div>
          </div>
        </Card>

        <div className="border-y border-white/[0.10] px-1 py-4">
          <div className="mb-3 flex items-center gap-2 text-xs text-gray-400">
            <Activity size={14} />
            <span>验证顺序</span>
          </div>
          <ol className="space-y-2.5 text-xs leading-5 text-gray-500">
            <li><span className="mr-2 font-mono text-gray-700">01</span>先看高频价格是否形成共振</li>
            <li><span className="mr-2 font-mono text-gray-700">02</span>再看国家结构与关键通道暴露</li>
            <li><span className="mr-2 font-mono text-gray-700">03</span>最后由官方变化与事件确认</li>
          </ol>
        </div>
      </div>

      {layer.indicators.length ? (
        <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4" aria-label="高频驱动因子">
          {layer.indicators.map((indicator) => (
            <div key={indicator.id} className="min-w-0 bg-[#0b0d0f] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[11px] text-gray-500">{indicator.label}</p>
                <span className="text-[9px] text-gray-700">{indicator.symbol}</span>
              </div>
              <p className="mt-2 font-mono text-lg text-gray-200">
                {formatNumber(indicator.value, 3)} <span className="text-[10px] text-gray-600">{indicator.unit}</span>
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 text-[10px]">
                <span className="text-gray-600">20日</span>
                <span className="font-mono" style={{ color: (indicator.change20d ?? 0) >= 0 ? "#d49a54" : "#55a8a1" }}>
                  {formatSigned(indicator.change20d, indicator.changeUnit)}
                </span>
                <span className="text-gray-600">60日</span>
                <span className="font-mono" style={{ color: (indicator.change60d ?? 0) >= 0 ? "#d49a54" : "#55a8a1" }}>
                  {formatSigned(indicator.change60d, indicator.changeUnit)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(330px,0.95fr)]">
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.10] px-5 py-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-white"><MapPinned size={15} /><span>国家结构与暴露</span></div>
              <p className="mt-1.5 text-[10px] text-gray-600">地图与列表使用同一口径；空值不补零</p>
            </div>
            <span className="text-[10px] text-gray-600">{rankedCountries.length} 个样本</span>
          </div>

          {rankedCountries.length ? (
            <div className="max-h-[430px] overflow-y-auto divide-y divide-white/[0.07]">
              {rankedCountries.map((country, index) => {
                const primary = countryPrimary(country);
                const selected = country.countryId === selectedCountryId;
                return (
                  <button
                    type="button"
                    key={`${country.countryId}-${country.name}`}
                    onClick={() => onSelectCountry(country.countryId)}
                    className="grid w-full grid-cols-[26px_minmax(120px,1fr)_110px] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.035]"
                    style={{ background: selected ? "rgba(255,255,255,0.05)" : undefined }}
                  >
                    <span className="font-mono text-[10px] text-gray-700">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0">
                      <span className={selected ? "block truncate text-sm text-white" : "block truncate text-sm text-gray-300"}>{country.name}</span>
                      <span className="mt-1 block truncate text-[10px] text-gray-600">{country.role} · {country.region}</span>
                    </span>
                    <span className="min-w-0 text-right">
                      <span className="block truncate font-mono text-xs text-gray-300">{primary.value}</span>
                      <span className="mt-1 block truncate text-[9px] text-gray-700">{primary.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid min-h-44 place-items-center px-6 text-center text-xs leading-5 text-gray-600">
              该图层没有可验证的国家级实时值，地图保持无着色
            </div>
          )}
        </Card>

        <div className="space-y-6">
          {routes.length ? (
            <Card padding="none" className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.10] px-5 py-4">
                <div className="flex items-center gap-2 text-sm text-white"><Route size={15} /><span>关键通道与走廊</span></div>
                <span className="text-[10px] text-gray-600">{routes.length} 条</span>
              </div>
              <div className="max-h-[430px] overflow-y-auto divide-y divide-white/[0.07]">
                {routes.map((route) => (
                  <div key={route.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs text-gray-300">{route.name}</p>
                        <p className="mt-1 text-[10px] text-gray-600">{route.region} · {route.asOf}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-xs" style={{ color: route.risk === "critical" ? "#e7685d" : route.risk === "elevated" ? "#d49a54" : "#aab4be" }}>
                          {route.value == null ? route.risk === "critical" ? "关键" : "结构" : `${formatNumber(route.value)} ${route.unit}`}
                        </p>
                        {route.share != null ? <p className="mt-1 text-[9px] text-gray-700">海运占比 {route.share}%</p> : null}
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-gray-500">{route.detail}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card padding="md">
            <div className="mb-4 flex items-center gap-2 text-sm text-white"><AlertTriangle size={15} /><span>监测信号</span></div>
            {layer.signals.length ? (
              <div className="space-y-3">
                {layer.signals.map((signal) => (
                  <div key={signal.id} className="border-l-2 pl-3" style={{ borderColor: TONE_COLORS[signal.tone] }}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-gray-300">{signal.label}</p>
                      <span className="font-mono text-[11px]" style={{ color: TONE_COLORS[signal.tone] }}>
                        {signal.value == null ? "--" : `${signal.value > 0 ? "+" : ""}${formatNumber(signal.value, 1)} ${signal.unit}`}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[10px] leading-5 text-gray-600">{signal.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs leading-5 text-gray-600">媒体监测源当前限流或不可用，保留降级状态，不输出零值判断。</p>
            )}
          </Card>
        </div>
      </div>

      {selectedCountry ? (
        <div className="mt-5 grid gap-4 border-y border-white/[0.10] py-4 md:grid-cols-[minmax(150px,0.35fr)_minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-600">Selected country</p>
            <p className="mt-1 text-base font-semibold text-white">{selectedCountry.name}</p>
          </div>
          <p className="text-xs leading-5 text-gray-400">{selectedCountry.detail}</p>
          <div className="text-left md:text-right">
            <p className="text-[10px] text-gray-600">{EVIDENCE_LABELS[selectedCountry.evidence]}</p>
            <p className="mt-1 font-mono text-xs" style={{ color: EVIDENCE_COLORS[selectedCountry.evidence] }}>{selectedCountry.asOf}</p>
          </div>
        </div>
      ) : null}

      {layer.stories.length ? (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-xs text-gray-400"><ShieldCheck size={14} /><span>待核实事件线索</span></div>
          <div className="grid gap-px overflow-hidden border border-white/[0.10] bg-white/[0.10] md:grid-cols-2">
            {layer.stories.slice(0, 8).map((story) => (
              <a key={`${story.url}-${story.publishedAt}`} href={story.url} target="_blank" rel="noreferrer" className="min-w-0 bg-[#111619] px-4 py-3.5 hover:bg-[#171d21]">
                <p className="line-clamp-2 text-xs leading-5 text-gray-300">{story.title}</p>
                <p className="mt-2 truncate text-[10px] text-gray-600">{story.domain} · {story.sourceCountry} · {story.language}</p>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.55fr)]">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-gray-400"><Database size={14} /><span>来源与口径</span></div>
          <div className="border-y border-white/[0.10] divide-y divide-white/[0.07]">
            {layer.sources.map((source) => (
              <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 py-3 hover:bg-white/[0.02]">
                <div className="min-w-0">
                  <p className="truncate text-xs text-gray-300">{source.name}</p>
                  <p className="mt-1 text-[10px] text-gray-600">{source.organization} · {source.frequency} · {source.asOf}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[10px]" style={{ color: EVIDENCE_COLORS[source.evidence] }}>
                  <span>{EVIDENCE_LABELS[source.evidence]}</span><ExternalLink size={12} />
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="border-l-2 border-[#d49a54]/45 pl-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-600">分析边界</p>
          <p className="mt-2 text-xs leading-5 text-gray-400">{layer.methodology}</p>
          <p className="mt-3 text-[11px] leading-5 text-[#d49a54]">{layer.caveat}</p>
        </div>
      </div>
    </section>
  );
}