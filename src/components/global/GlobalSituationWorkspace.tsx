"use client";

import { useEffect, useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import atlas from "world-atlas/countries-110m.json";
import type { FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  CircleDollarSign,
  Clock3,
  Coins,
  Database,
  Fuel,
  Landmark,
  MapPinned,
  Radio,
  RefreshCw,
  ShieldAlert,
  Ship,
} from "lucide-react";
import Card from "@/components/ui/Card";
import GlobalCapitalLedgerPanel from "@/components/global/GlobalCapitalLedgerPanel";
import GlobalComparisonPanels, { type GlobalComparisonMarket } from "@/components/global/GlobalComparisonPanels";
import GlobalContextPanel from "@/components/global/GlobalContextPanel";
import GlobalFactorAttributionPanel, { type GlobalFactorModel } from "@/components/global/GlobalFactorAttributionPanel";
import {
  GLOBAL_LAYERS,
  getGlobalLayer,
  type GlobalLayerId,
} from "@/lib/global-intelligence/layers";
import type {
  ContextCountry,
  ContextLayerId,
  GlobalContextResponse,
} from "@/lib/global-intelligence/context-data";
import { capitalLedgerUrl, globalContextUrl, marketFlowsUrl, withCurrentFreshness } from "@/lib/data-source";

interface AtlasProperties {
  name?: string;
}

interface MarketFlow extends GlobalComparisonMarket {
  id: string;
  countryId: string;
  name: string;
  shortName: string;
  symbol: string;
  exchange: string;
  coordinates: [number, number];
  currency: string;
  price: number;
  asOf: string;
  return1d: number;
}

interface FlowResponse {
  generatedAt: string;
  source: string;
  dataClass: "proxy";
  methodology: string;
  summary: {
    strongest: MarketFlow;
    weakest: MarketFlow;
    positiveCount: number;
    negativeCount: number;
    averageScore: number;
    marketCount: number;
  };
  factorModel: GlobalFactorModel;
  markets: MarketFlow[];
  errors: string[];
}

type LedgerMarket = "CN-A" | "HK";

type LedgerSnapshot = {
  market: LedgerMarket;
  latestDate: string | null;
  analysis: {
    headline: string;
    summary: string;
    conclusions: Array<{ status: string }>;
  };
  quality: {
    validCoverage: number;
    nonConflictRatio: number;
    freshness: {
      ageDays: number | null;
      status: "fresh" | "stale" | "unavailable";
    };
  };
};

type CapitalVisual = {
  value: number;
  evidence: "ledger" | "proxy";
  label: string;
  detail: string;
};

const WIDTH = 1320;
const HEIGHT = 650;
const topology = atlas as unknown as Topology<{ countries: GeometryCollection }>;
const countries = feature(topology, topology.objects.countries) as unknown as FeatureCollection<Geometry, AtlasProperties>;
const projection = geoNaturalEarth1().fitExtent([[28, 28], [WIDTH - 28, HEIGHT - 28]], countries);
const drawPath = geoPath(projection);

const COUNTRY_LABELS: Record<string, string> = {
  "036": "澳大利亚",
  "076": "巴西",
  "124": "加拿大",
  "156": "中国",
  "158": "中国台湾",
  "276": "德国",
  "356": "印度",
  "392": "日本",
  "410": "韩国",
  "643": "俄罗斯",
  "682": "沙特阿拉伯",
  "710": "南非",
  "826": "英国",
  "840": "美国",
};

const MARKET_LABEL_OFFSETS: Record<string, [number, number]> = {
  eu: [-18, 26],
  uk: [-18, -14],
  cn: [-30, 25],
  hk: [-38, 43],
  tw: [36, 34],
  kr: [-28, -15],
  jp: [34, 0],
};

const LAYER_ICONS: Record<GlobalLayerId, LucideIcon> = {
  capital: CircleDollarSign,
  equities: ChartNoAxesCombined,
  gold: Coins,
  energy: Fuel,
  trade: Ship,
  events: Radio,
  geopolitics: ShieldAlert,
};

const CONTEXT_LAYER_IDS = new Set<GlobalLayerId>(["gold", "energy", "trade", "events", "geopolitics"]);

function isContextLayer(id: GlobalLayerId): id is ContextLayerId {
  return CONTEXT_LAYER_IDS.has(id);
}

function countryLabel(id: string, fallback?: string) {
  return COUNTRY_LABELS[id] ?? fallback ?? `国家 ${id}`;
}

function signed(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function contextMetric(value: number | null | undefined, unit = "") {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value > 0 && unit === "吨" ? "+" : ""}${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
}

function signalColor(value: number, scale: "score" | "momentum" = "score") {
  const strong = scale === "score" ? 45 : 8;
  const mild = scale === "score" ? 15 : 2;
  if (value >= strong) return "#e7685d";
  if (value >= mild) return "#d49a54";
  if (value <= -strong) return "#39a77c";
  if (value <= -mild) return "#55a8a1";
  return "#aab4be";
}

function contextSignalColor(layerId: ContextLayerId, value: number) {
  if (layerId === "gold") {
    if (value >= 15) return "#d8aa55";
    if (value > 0) return "#b78c4b";
    if (value <= -15) return "#55a8a1";
    if (value < 0) return "#6e9696";
    return "#7f8b95";
  }
  if (layerId === "energy") {
    if (value <= -60) return "#e7685d";
    if (value < -20) return "#d49a54";
    if (value >= 60) return "#55a8a1";
    if (value > 20) return "#70a18f";
    return "#7f8b95";
  }
  if (layerId === "trade") {
    if (value >= 65) return "#d49a54";
    if (value >= 35) return "#a89969";
    return "#718792";
  }
  if (value >= 70) return "#e7685d";
  if (value >= 45) return "#d49a54";
  if (value > 0) return "#8c8994";
  return "#7f8b95";
}

function ledgerMarketFor(marketId: string): LedgerMarket | null {
  if (marketId === "cn") return "CN-A";
  if (marketId === "hk") return "HK";
  return null;
}

function ledgerVisual(snapshot: LedgerSnapshot | undefined): CapitalVisual | null {
  if (!snapshot
    || snapshot.quality.freshness.status !== "fresh"
    || snapshot.quality.validCoverage < 70
    || snapshot.quality.nonConflictRatio < 99) return null;
  const status = snapshot.analysis.conclusions[0]?.status;
  const value = status === "expanding" ? 35 : status === "contracting" ? -35 : status === "neutral" ? 0 : null;
  if (value == null) return null;
  return {
    value,
    evidence: "ledger",
    label: "真实账本",
    detail: `${snapshot.analysis.headline} · ${snapshot.latestDate ?? "无日期"}`,
  };
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-gray-600 mb-2">{label}</p>
      <p className="text-lg font-semibold font-mono truncate" style={{ color: tone ?? "#e7e9ec" }}>{value}</p>
    </div>
  );
}

function EvidenceRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-white/[0.06] last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-mono" style={{ color: tone ?? "#c3c8cf" }}>{value}</span>
    </div>
  );
}

export default function GlobalSituationWorkspace() {
  const [data, setData] = useState<FlowResponse | null>(null);
  const [contextData, setContextData] = useState<GlobalContextResponse | null>(null);
  const [ledgers, setLedgers] = useState<Partial<Record<LedgerMarket, LedgerSnapshot>>>({});
  const [layerId, setLayerId] = useState<GlobalLayerId>("capital");
  const [selectedCountryId, setSelectedCountryId] = useState("840");
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>("us");
  const [hoveredCountryId, setHoveredCountryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(true);
  const [error, setError] = useState("");
  const [contextError, setContextError] = useState("");

  const activeLayer = getGlobalLayer(layerId);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(marketFlowsUrl(), { cache: "no-store" });
      if (!response.ok) throw new Error("全球市场信号暂时不可用");
      const payload = await response.json() as FlowResponse;
      setData(payload);
      setSelectedMarketId((current) => current && payload.markets.some((market) => market.id === current)
        ? current
        : payload.summary.strongest.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "全球态势数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadContextData() {
    setContextLoading(true);
    setContextError("");
    try {
      const response = await fetch(globalContextUrl(), { cache: "no-store" });
      if (!response.ok) throw new Error("资源与事件图层暂时不可用");
      setContextData(await response.json() as GlobalContextResponse);
    } catch (reason) {
      setContextError(reason instanceof Error ? reason.message : "资源与事件图层加载失败");
    } finally {
      setContextLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContextData(), 0);
    return () => window.clearTimeout(timer);
  }, []);

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

  const markets = useMemo(() => data?.markets ?? [], [data?.markets]);
  const marketLayer = layerId === "capital" || layerId === "equities";
  const activeContextLayer = isContextLayer(layerId) ? contextData?.layers[layerId] ?? null : null;
  const contextCountriesById = useMemo(() => {
    const result = new Map<string, ContextCountry[]>();
    for (const country of activeContextLayer?.countries ?? []) {
      const list = result.get(country.countryId) ?? [];
      list.push(country);
      result.set(country.countryId, list);
    }
    return result;
  }, [activeContextLayer]);
  const marketsByCountry = useMemo(() => {
    const result = new Map<string, MarketFlow[]>();
    for (const market of markets) {
      const list = result.get(market.countryId) ?? [];
      list.push(market);
      result.set(market.countryId, list);
    }
    return result;
  }, [markets]);

  const countryOptions = useMemo(() => countries.features
    .map((country, index) => ({
      id: String(country.id ?? `feature-${index}`),
      label: countryLabel(String(country.id), country.properties?.name),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN")), []);

  const ranked = useMemo(() => [...markets].sort((a, b) => {
    const aValue = layerId === "equities" ? a.return20d : a.flowScore;
    const bValue = layerId === "equities" ? b.return20d : b.flowScore;
    return bValue - aValue;
  }), [layerId, markets]);

  const selectedCountry = countryOptions.find((country) => country.id === selectedCountryId);
  const selectedContextCountry = contextCountriesById.get(selectedCountryId)?.[0] ?? null;
  const countryMarkets = marketsByCountry.get(selectedCountryId) ?? [];
  const selectedMarket = markets.find((market) => market.id === selectedMarketId)
    ?? countryMarkets[0]
    ?? null;
  const hoveredCountry = countryOptions.find((country) => country.id === hoveredCountryId);

  const capitalVisuals = useMemo(() => new Map(markets.map((market) => {
    const ledgerMarket = ledgerMarketFor(market.id);
    const snapshot = ledgerMarket ? ledgers[ledgerMarket] : undefined;
    const verified = ledgerVisual(snapshot);
    if (verified) return [market.id, verified] as const;
    const fallbackReason = snapshot?.quality.freshness.status === "stale"
      ? `账本已过期 ${snapshot.quality.freshness.ageDays ?? "--"} 天，回退至价格代理`
      : snapshot ? "账本未通过质量门，回退至价格代理" : "该市场尚无真实资金账本";
    return [market.id, {
      value: market.flowScore,
      evidence: "proxy" as const,
      label: "ETF 价格代理",
      detail: fallbackReason,
    }] as const;
  })), [ledgers, markets]);

  const capitalEvidenceCounts = useMemo(() => ({
    ledger: [...capitalVisuals.values()].filter((visual) => visual.evidence === "ledger").length,
    proxy: [...capitalVisuals.values()].filter((visual) => visual.evidence === "proxy").length,
    stale: Object.values(ledgers).filter((snapshot) => snapshot?.quality.freshness.status === "stale").length,
  }), [capitalVisuals, ledgers]);

  const countryValues = useMemo(() => {
    const result = new Map<string, number>();
    if (activeContextLayer) {
      for (const [countryId, list] of contextCountriesById) {
        const values = list.flatMap((country) => country.signalValue == null ? [] : [country.signalValue]);
        if (values.length) result.set(countryId, values.reduce((sum, value) => sum + value, 0) / values.length);
      }
      return result;
    }
    if (!marketLayer || activeLayer.status !== "live") return result;
    for (const [countryId, list] of marketsByCountry) {
      const values = list.map((market) => layerId === "equities"
        ? market.return20d
        : capitalVisuals.get(market.id)?.value ?? market.flowScore);
      result.set(countryId, values.reduce((sum, value) => sum + value, 0) / values.length);
    }
    return result;
  }, [activeContextLayer, activeLayer.status, capitalVisuals, contextCountriesById, layerId, marketLayer, marketsByCountry]);

  const conflictCount = markets.filter((market) => market.return5d * market.return20d < 0).length;
  const riskRegime = !data ? "等待数据"
    : data.summary.averageScore >= 12 ? "风险偏好扩张"
      : data.summary.averageScore <= -12 ? "风险偏好收缩"
        : "区域分化";
  const leadershipGap = data ? data.summary.strongest.flowScore - data.summary.weakest.flowScore : 0;

  function chooseCountry(countryId: string) {
    setSelectedCountryId(countryId);
    const availableMarkets = marketsByCountry.get(countryId) ?? [];
    setSelectedMarketId(availableMarkets[0]?.id ?? null);
  }

  function chooseMarket(market: MarketFlow) {
    setSelectedCountryId(market.countryId);
    setSelectedMarketId(market.id);
  }

  const selectedValue = selectedMarket
    ? layerId === "equities" ? selectedMarket.return20d : capitalVisuals.get(selectedMarket.id)?.value ?? selectedMarket.flowScore
    : null;
  const selectedCapitalVisual = selectedMarket ? capitalVisuals.get(selectedMarket.id) : null;
  const selectedScale = layerId === "equities" ? "momentum" as const : "score" as const;
  const preferredCapitalMarket = selectedMarket?.id === "cn" ? "CN-A" as const
    : selectedMarket?.id === "hk" ? "HK" as const
      : null;
  const contextFocus = activeContextLayer
    ? [...activeContextLayer.countries]
      .filter((country) => country.signalValue != null)
      .sort((left, right) => Math.abs(right.signalValue ?? 0) - Math.abs(left.signalValue ?? 0))[0]
    : null;
  const selectedDeskValue = activeContextLayer ? selectedContextCountry?.signalValue ?? null : selectedValue;

  return (
    <div className="global-intelligence pb-16">
      <header className="mb-7">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-px bg-white/20" />
          <span className="text-xs uppercase tracking-[0.24em] text-gray-500">World Intelligence</span>
          <span className="text-[10px] uppercase tracking-wider text-[#55a8a1] border border-[#55a8a1]/25 px-2 py-1 rounded">Framework 01</span>
        </div>
        <div className="flex items-end justify-between gap-5 flex-wrap">
          <div>
            <h1 className="text-4xl xl:text-5xl font-bold text-white">全球态势</h1>
            <p className="text-sm text-gray-400 mt-3 max-w-3xl leading-6">
              从国家出发，把资金、市场、资源和事件放回同一张地理关系图，优先识别方向、传导与验证条件。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] uppercase tracking-wider text-gray-600">Data freshness</p>
              <p className="text-xs text-gray-400 mt-1">
                {activeContextLayer
                  ? new Date(activeContextLayer.generatedAt).toLocaleString("zh-CN")
                  : data ? new Date(data.generatedAt).toLocaleString("zh-CN") : "等待更新"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { void loadData(); void loadContextData(); }}
              title="刷新全球态势数据"
              className="w-10 h-10 grid place-items-center rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <RefreshCw size={17} className={loading || contextLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </header>

      <nav className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-6" aria-label="全球态势数据图层">
        {GLOBAL_LAYERS.map((layer) => {
          const Icon = LAYER_ICONS[layer.id];
          const active = layer.id === layerId;
          const contextStatus = isContextLayer(layer.id) ? contextData?.layers[layer.id]?.status : null;
          return (
            <button
              type="button"
              key={layer.id}
              onClick={() => setLayerId(layer.id)}
              title={layer.decisionQuestion}
              className="h-10 shrink-0 flex items-center gap-2 px-3 rounded-lg border text-xs transition-colors"
              style={{
                color: active ? "#f4f5f6" : "#a8b2bc",
                borderColor: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)",
                background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
              }}
            >
              <Icon size={15} />
              <span>{layer.label}</span>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: contextStatus === "partial" ? "#d49a54" : layer.status === "live" ? "#55a8a1" : "#424a53" }}
              />
            </button>
          );
        })}
      </nav>

      {error || contextError ? (
        <div className="mb-6 px-4 py-3 rounded-lg border border-red-400/20 bg-red-400/[0.05] text-sm text-red-300">{error || contextError}</div>
      ) : null}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-xl overflow-hidden border border-white/10 bg-white/10 mb-6" aria-label="全球态势摘要">
        {activeContextLayer ? (
          <>
            <div className="bg-[#0b0d0f] p-4 sm:p-5"><Metric label="数据状态" value={activeContextLayer.status === "ready" ? "完整" : "部分降级"} tone={activeContextLayer.status === "ready" ? "#55a8a1" : "#d49a54"} /></div>
            <div className="bg-[#0b0d0f] p-4 sm:p-5"><Metric label="结构焦点" value={contextFocus?.name ?? activeContextLayer.signals[0]?.label ?? "待监测"} tone="#d49a54" /></div>
            <div className="bg-[#0b0d0f] p-4 sm:p-5"><Metric label="结构覆盖" value={`${activeContextLayer.countries.length} 国 · ${activeContextLayer.routes.length} 通道`} tone="#aeb4bc" /></div>
            <div className="bg-[#0b0d0f] p-4 sm:p-5"><Metric label="数据截至" value={activeContextLayer.asOf} tone="#55a8a1" /></div>
          </>
        ) : (
          <>
            <div className="bg-[#0b0d0f] p-4 sm:p-5"><Metric label="当前环境" value={activeLayer.status === "live" ? riskRegime : "等待接入"} tone={data ? signalColor(data.summary.averageScore) : undefined} /></div>
            <div className="bg-[#0b0d0f] p-4 sm:p-5"><Metric label="领导市场" value={activeLayer.status === "live" ? ranked[0]?.shortName ?? "--" : "--"} tone="#d49a54" /></div>
            <div className="bg-[#0b0d0f] p-4 sm:p-5"><Metric label="强弱差" value={activeLayer.status === "live" ? String(leadershipGap) : "--"} tone="#aeb4bc" /></div>
            <div className="bg-[#0b0d0f] p-4 sm:p-5"><Metric label="国家底座" value={`${countries.features.length} 国`} tone="#55a8a1" /></div>
          </>
        )}
      </section>

      <section className="grid xl:grid-cols-[minmax(0,1fr)_350px] gap-6 items-start">
        <Card padding="none" className="overflow-hidden">
          <div className="px-4 sm:px-5 py-4 flex items-center justify-between gap-4 border-b border-white/10 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <MapPinned size={16} className="text-gray-500" />
                <p className="text-sm font-semibold text-white">{activeLayer.label}</p>
                <span className="text-[10px] text-gray-600">{activeLayer.cadence}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1.5">{activeLayer.decisionQuestion}</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <span className="hidden sm:inline">定位国家</span>
              <select
                value={selectedCountryId}
                onChange={(event) => chooseCountry(event.target.value)}
                className="h-9 min-w-40 rounded-lg border border-white/10 bg-[#101316] px-3 text-xs text-gray-300 outline-none focus:border-white/25"
              >
                {countryOptions.map((country) => <option key={country.id} value={country.id}>{country.label}</option>)}
              </select>
            </label>
          </div>

          <div className="relative overflow-x-auto bg-[#07090b]">
            <div className="absolute left-4 top-4 z-10 px-3 py-2 rounded-md border border-white/[0.08] bg-[#090c0e]/90 pointer-events-none">
              <p className="text-[10px] uppercase tracking-wider text-gray-600">Country</p>
              <p className="text-xs text-gray-300 mt-1">{hoveredCountry?.label ?? selectedCountry?.label ?? "选择国家"}</p>
            </div>
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block w-full min-w-[920px] aspect-[2.03/1]" role="img" aria-label={`${activeLayer.label}世界地图`}>
              <defs>
                <pattern id="situation-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
                </pattern>
                <filter id="situation-glow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <rect width={WIDTH} height={HEIGHT} fill="url(#situation-grid)" />

              <g>
                {countries.features.map((country, index) => {
                  const countryId = String(country.id ?? `feature-${index}`);
                  const value = countryValues.get(countryId);
                  const selected = countryId === selectedCountryId;
                  const hovered = countryId === hoveredCountryId;
                  const tone = value == null
                    ? "#12181c"
                    : activeContextLayer ? contextSignalColor(activeContextLayer.id, value) : signalColor(value, selectedScale);
                  return (
                    <path
                      key={countryId}
                      d={drawPath(country) ?? undefined}
                      fill={tone}
                      fillOpacity={value == null ? selected ? 0.9 : 0.66 : selected ? 0.72 : 0.42}
                      stroke={selected ? "#f4f5f6" : hovered ? "#8f99a4" : "#303940"}
                      strokeWidth={selected ? 1.8 : hovered ? 1.1 : 0.65}
                      onClick={() => chooseCountry(countryId)}
                      onMouseEnter={() => setHoveredCountryId(countryId)}
                      onMouseLeave={() => setHoveredCountryId(null)}
                      className="cursor-pointer transition-colors"
                    >
                      <title>{countryLabel(countryId, country.properties?.name)}</title>
                    </path>
                  );
                })}
              </g>

              {marketLayer && activeLayer.status === "live" ? (
                <g>
                  {markets.map((market) => {
                    const point = projection(market.coordinates);
                    if (!point) return null;
                    const active = selectedMarket?.id === market.id;
                    const capitalVisual = capitalVisuals.get(market.id);
                    const value = layerId === "equities" ? market.return20d : capitalVisual?.value ?? market.flowScore;
                    const color = signalColor(value, selectedScale);
                    const radius = 6 + Math.min(6, Math.abs(value) / (layerId === "equities" ? 3 : 14));
                    const [labelX, labelY] = MARKET_LABEL_OFFSETS[market.id] ?? [0, radius + 19];
                    return (
                      <g
                        key={market.id}
                        transform={`translate(${point[0]},${point[1]})`}
                        onClick={() => chooseMarket(market)}
                        className="cursor-pointer"
                        role="button"
                        aria-label={`查看${market.name}信号`}
                      >
                        <circle r={radius + 9} fill={color} opacity={active ? 0.18 : 0.08} filter="url(#situation-glow)" />
                        {layerId === "capital" && capitalVisual?.evidence === "ledger" ? (
                          <circle r={radius + 5} fill="none" stroke="#f4f5f6" strokeWidth="1" strokeDasharray="2 3" opacity="0.65" />
                        ) : null}
                        <circle r={radius} fill="#080a0c" stroke={color} strokeWidth={active ? 3 : 2} />
                        <circle r={Math.max(2.5, radius - 4.5)} fill={color} />
                        <text x={labelX} y={labelY} textAnchor="middle" fill={active ? "#fff" : "#aeb5bd"} fontSize="11" fontWeight={active ? 700 : 500}>
                          {market.shortName}
                        </text>
                      </g>
                    );
                  })}
                </g>
              ) : null}

              {activeContextLayer?.routes.some((route) => route.coordinates) ? (
                <g>
                  {activeContextLayer.routes.map((route) => {
                    if (!route.coordinates) return null;
                    const point = projection(route.coordinates);
                    if (!point) return null;
                    const color = route.risk === "critical" ? "#e7685d" : route.risk === "elevated" ? "#d49a54" : "#aab4be";
                    const radius = 5 + Math.min(6, (route.share ?? route.value ?? 0) / 5);
                    return (
                      <g key={route.id} transform={`translate(${point[0]},${point[1]})`}>
                        <circle r={radius + 8} fill={color} opacity="0.10" filter="url(#situation-glow)" />
                        <circle r={radius} fill="#080a0c" stroke={color} strokeWidth="2" />
                        <circle r={Math.max(2.5, radius - 4)} fill={color} />
                        <text x="0" y={radius + 17} textAnchor="middle" fill="#c4cbd2" fontSize="9">{route.name}</text>
                        <title>{`${route.name} · ${route.value ?? "--"} ${route.unit} · ${route.detail}`}</title>
                      </g>
                    );
                  })}
                </g>
              ) : null}
            </svg>
          </div>

          <div className="px-4 sm:px-5 py-3 border-t border-white/[0.08] flex items-center justify-between gap-4 text-[10px] text-gray-600 flex-wrap">
            <span>{activeLayer.sourceHint}</span>
            <span>{activeContextLayer
              ? `国家数据 ${activeContextLayer.countries.length} · 通道 ${activeContextLayer.routes.length} · ${activeContextLayer.status === "ready" ? "完整" : "部分降级"}`
              : activeLayer.status === "live"
                ? layerId === "capital"
                  ? `真实账本 ${capitalEvidenceCounts.ledger} · ETF代理 ${capitalEvidenceCounts.proxy} · 过期账本 ${capitalEvidenceCounts.stale}`
                  : `覆盖 ${data?.summary.marketCount ?? 0} 个市场 · 20日价格动量`
                : "图层接口待接入"}</span>
          </div>
        </Card>

        <aside className="space-y-5" aria-label="国家研判面板">
          <Card padding="md">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600 mb-2">Country desk</p>
                <h2 className="text-2xl font-semibold text-white">{selectedContextCountry?.name ?? selectedCountry?.label ?? "选择国家"}</h2>
                <p className="text-xs text-gray-500 mt-2">{activeLayer.label} · {activeLayer.cadence}</p>
              </div>
              <div
                className="w-10 h-10 rounded-lg grid place-items-center border border-white/[0.08]"
                style={{ color: selectedDeskValue == null ? "#8f9aa5" : activeContextLayer ? contextSignalColor(activeContextLayer.id, selectedDeskValue) : signalColor(selectedDeskValue, selectedScale) }}
              >
                {selectedDeskValue == null ? <Landmark size={19} /> : selectedDeskValue >= 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
              </div>
            </div>

            {marketLayer && countryMarkets.length > 1 && activeLayer.status === "live" ? (
              <div className="flex gap-1.5 mb-5">
                {countryMarkets.map((market) => (
                  <button
                    type="button"
                    key={market.id}
                    onClick={() => setSelectedMarketId(market.id)}
                    className="px-2.5 py-1.5 rounded-md text-[11px] border transition-colors"
                    style={{
                      color: selectedMarket?.id === market.id ? "#fff" : "#a0abb5",
                      borderColor: selectedMarket?.id === market.id ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)",
                      background: selectedMarket?.id === market.id ? "rgba(255,255,255,0.08)" : "transparent",
                    }}
                  >
                    {market.shortName}
                  </button>
                ))}
              </div>
            ) : null}

            {activeContextLayer ? selectedContextCountry ? (
              <div className="space-y-5">
                <div className="border-l-2 pl-4" style={{ borderColor: selectedDeskValue == null ? "#8f9aa5" : contextSignalColor(activeContextLayer.id, selectedDeskValue) }}>
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5">结构角色</p>
                  <p className="text-sm font-medium text-gray-200">{selectedContextCountry.role}</p>
                  <p className="mt-2 text-xs leading-5 text-gray-500">{selectedContextCountry.detail}</p>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">可验证证据</p>
                  <EvidenceRow label={selectedContextCountry.metricLabel} value={contextMetric(selectedContextCountry.metricValue, selectedContextCountry.metricUnit)} />
                  {selectedContextCountry.secondaryLabel ? (
                    <EvidenceRow
                      label={selectedContextCountry.secondaryLabel}
                      value={contextMetric(selectedContextCountry.secondaryValue, selectedContextCountry.secondaryUnit)}
                      tone={(selectedContextCountry.secondaryValue ?? 0) > 0 ? "#d49a54" : (selectedContextCountry.secondaryValue ?? 0) < 0 ? "#55a8a1" : undefined}
                    />
                  ) : null}
                  <EvidenceRow label="证据类型" value={selectedContextCountry.evidence === "official" ? "官方披露" : selectedContextCountry.evidence === "model" ? "结构模型" : "监测代理"} />
                  <EvidenceRow label="数据截至" value={selectedContextCountry.asOf} />
                </div>

                <div className="pt-4 border-t border-white/[0.08]">
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">待确认</p>
                  <p className="text-xs text-gray-500 leading-5">{activeContextLayer.caveat}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="border-l-2 border-[#d49a54]/50 pl-4">
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5">全局判断</p>
                  <p className="text-sm text-gray-200 leading-6">{activeContextLayer.decision.headline}</p>
                  <p className="mt-2 text-xs text-gray-500 leading-5">{activeContextLayer.decision.summary}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">该国状态</p>
                  <p className="text-xs text-gray-500 leading-5">该图层没有该国的可验证结构值，地图保持无着色，不以全球新闻或价格代理补值。</p>
                </div>
              </div>
            ) : activeLayer.status === "live" && selectedMarket ? (
              <div className="space-y-5">
                <div className="border-l-2 pl-4" style={{ borderColor: signalColor(selectedValue ?? 0, selectedScale) }}>
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5">当前判断</p>
                  <p className="text-sm text-gray-200 leading-6">
                    {layerId === "capital"
                      ? selectedCapitalVisual?.evidence === "ledger"
                        ? `${selectedMarket.name}真实资金账本显示“${selectedCapitalVisual.detail}”。`
                        : `${selectedMarket.name}处于“${selectedMarket.signal}”状态，当前使用资金偏好的高频代理信号。`
                      : `${selectedMarket.name}近20日表现为 ${signed(selectedMarket.return20d)}，位于全球样本第 ${ranked.findIndex((market) => market.id === selectedMarket.id) + 1} 位。`}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">证据</p>
                  <EvidenceRow label="5日变化" value={signed(selectedMarket.return5d)} tone={signalColor(selectedMarket.return5d, "momentum")} />
                  <EvidenceRow label="20日变化" value={signed(selectedMarket.return20d)} tone={signalColor(selectedMarket.return20d, "momentum")} />
                  <EvidenceRow label="成交量脉冲" value={`${selectedMarket.volumeRatio.toFixed(2)}x`} />
                  <EvidenceRow label="代表资产" value={`${selectedMarket.symbol} · ${selectedMarket.exchange}`} />
                  {layerId === "capital" && selectedCapitalVisual ? (
                    <EvidenceRow
                      label="地图证据层"
                      value={selectedCapitalVisual.label}
                      tone={selectedCapitalVisual.evidence === "ledger" ? "#55a8a1" : "#d49a54"}
                    />
                  ) : null}
                </div>

                <div className="pt-4 border-t border-white/[0.08]">
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">待确认</p>
                  <p className="text-xs text-gray-500 leading-5">
                    {layerId === "capital" && selectedCapitalVisual
                      ? selectedCapitalVisual.detail
                      : "价格与成交量只能说明偏好，实际基金申赎、跨境证券持仓和本地资金净流入尚需低频数据确认。"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="border-l-2 border-white/15 pl-4">
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5">研判问题</p>
                  <p className="text-sm text-gray-200 leading-6">{activeLayer.decisionQuestion}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">接入标准</p>
                  <p className="text-xs text-gray-500 leading-5">{activeLayer.sourceHint}</p>
                </div>
                <div className="flex items-center gap-2 pt-4 border-t border-white/[0.08] text-xs text-gray-500">
                  <Clock3 size={14} />
                  <span>{activeLayer.status === "planned" ? "数据层待建设，不展示推测值" : "该国家暂无可靠信号"}</span>
                </div>
              </div>
            )}
          </Card>

          <div className="px-1">
            <div className="flex items-center gap-2 mb-3 text-xs text-gray-400"><Database size={14} /><span>证据等级</span></div>
            {activeContextLayer ? (
              <div className="space-y-2 text-[11px]">
                <div className="flex items-center justify-between"><span className="text-gray-600">官方结构来源</span><span className="text-[#55a8a1]">{activeContextLayer.sources.filter((source) => source.evidence === "official").length} 个</span></div>
                <div className="flex items-center justify-between"><span className="text-gray-600">市场驱动代理</span><span className="text-[#d49a54]">{activeContextLayer.indicators.length} 个</span></div>
                <div className="flex items-center justify-between"><span className="text-gray-600">媒体/模型层</span><span className="text-gray-400">{activeContextLayer.status === "ready" ? "可用" : "部分降级"}</span></div>
              </div>
            ) : (
              <div className="space-y-2 text-[11px]">
                <div className="flex items-center justify-between"><span className="text-gray-600">高频方向</span><span className="text-[#55a8a1]">已接入</span></div>
                <div className="flex items-center justify-between"><span className="text-gray-600">真实跨境流量</span><span className="text-gray-500">待确认</span></div>
                <div className="flex items-center justify-between"><span className="text-gray-600">事件因果归因</span><span className="text-gray-500">未接入</span></div>
              </div>
            )}
          </div>
        </aside>
      </section>

      {marketLayer && data?.factorModel ? (
        <GlobalFactorAttributionPanel
          model={data.factorModel}
          selectedMarketId={selectedMarket?.id ?? null}
          onSelectMarket={(marketId) => {
            const market = markets.find((item) => item.id === marketId);
            if (market) chooseMarket(market);
          }}
        />
      ) : null}

      {layerId === "capital" ? (
        <GlobalCapitalLedgerPanel preferredMarket={preferredCapitalMarket} />
      ) : null}

      {marketLayer && activeLayer.status === "live" ? (
        <GlobalComparisonPanels
          markets={markets}
          selectedMarketId={selectedMarket?.id ?? null}
          onSelectMarket={(market) => {
            const fullMarket = markets.find((item) => item.id === market.id);
            if (fullMarket) chooseMarket(fullMarket);
          }}
        />
      ) : null}

      {activeContextLayer ? (
        <GlobalContextPanel
          layer={activeContextLayer}
          selectedCountryId={selectedCountryId}
          onSelectCountry={chooseCountry}
        />
      ) : null}

      {marketLayer ? (
        <section className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] gap-6 mt-6">
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-white"><Activity size={16} /><span>全球强弱序列</span></div>
            <span className="text-[10px] text-gray-600">{layerId === "equities" ? "20日动量" : "资金压力代理"}</span>
          </div>
          {activeLayer.status === "live" ? (
            <div className="divide-y divide-white/[0.06]">
              {ranked.slice(0, 8).map((market, index) => {
                const value = layerId === "equities" ? market.return20d : market.flowScore;
                return (
                  <button
                    type="button"
                    key={market.id}
                    onClick={() => chooseMarket(market)}
                    className="w-full grid grid-cols-[28px_minmax(100px,1fr)_72px_72px_70px] gap-3 items-center px-5 py-3 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="text-xs text-gray-700 font-mono">{String(index + 1).padStart(2, "0")}</span>
                    <span className="text-sm text-gray-300 truncate">{market.name}<span className="text-[10px] text-gray-600 ml-2">{market.symbol}</span></span>
                    <span className="text-xs font-mono text-right" style={{ color: signalColor(market.return5d, "momentum") }}>{signed(market.return5d)}</span>
                    <span className="text-xs font-mono text-right" style={{ color: signalColor(market.return20d, "momentum") }}>{signed(market.return20d)}</span>
                    <span className="text-xs font-mono text-right" style={{ color: signalColor(value, selectedScale) }}>{layerId === "equities" ? signed(value) : value}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="h-48 grid place-items-center text-sm text-gray-600">等待该图层的可验证国家级数据</div>
          )}
        </Card>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-semibold text-white">本轮研判</h3>
              <span className="text-[10px] text-gray-600">信号 → 证据 → 验证</span>
            </div>
            <div className="border-y border-white/[0.08] divide-y divide-white/[0.06]">
              <div className="py-4 grid grid-cols-[88px_1fr] gap-4"><span className="text-xs text-gray-600">市场环境</span><p className="text-xs text-gray-300 leading-5">{activeLayer.status === "live" ? `${riskRegime}，偏强 ${data?.summary.positiveCount ?? 0} 个、偏弱 ${data?.summary.negativeCount ?? 0} 个。` : activeLayer.decisionQuestion}</p></div>
              <div className="py-4 grid grid-cols-[88px_1fr] gap-4"><span className="text-xs text-gray-600">分化程度</span><p className="text-xs text-gray-300 leading-5">{activeLayer.status === "live" ? `最强与最弱压力差 ${leadershipGap}，短中期方向冲突 ${conflictCount} 个市场。` : "图层接入后计算国家间差异、路径和影响范围。"}</p></div>
              <div className="py-4 grid grid-cols-[88px_1fr] gap-4"><span className="text-xs text-gray-600">行动条件</span><p className="text-xs text-gray-300 leading-5">{activeLayer.status === "live" ? "优先跟踪领先市场是否获得真实流量确认，以及落后市场是否出现量价修复。" : `只在${activeLayer.sourceHint}形成可复核证据后输出方向。`}</p></div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">图层建设队列</h3>
            <div className="space-y-1">
              {GLOBAL_LAYERS.map((layer) => (
                <button type="button" key={layer.id} onClick={() => setLayerId(layer.id)} className="w-full flex items-center justify-between gap-3 py-2 text-left">
                  <span className="text-xs text-gray-400">{layer.label}</span>
                  <span className="text-[10px]" style={{ color: layer.status === "live" ? "#55a8a1" : "#9ba7b3" }}>{layer.status === "live" ? "运行中" : layer.cadence}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        </section>
      ) : null}

      <footer className="mt-6 flex items-center justify-between gap-4 flex-wrap text-[10px] text-gray-700">
        <span>{activeContextLayer?.methodology ?? data?.methodology ?? "高频市场代理数据等待加载"}</span>
        <span>{activeContextLayer ? activeContextLayer.sources.map((source) => source.organization).join(" · ") : data?.source ?? "StockBase Global Intelligence"}</span>
      </footer>
    </div>
  );
}