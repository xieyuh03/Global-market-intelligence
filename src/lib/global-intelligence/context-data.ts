export const CONTEXT_LAYER_IDS = ["gold", "energy", "trade", "events", "geopolitics"] as const;

export type ContextLayerId = typeof CONTEXT_LAYER_IDS[number];
export type ContextStatus = "ready" | "partial" | "unavailable";
export type ContextConfidence = "high" | "medium" | "low";
export type ContextTone = "positive" | "negative" | "neutral" | "warning";
export type ContextEvidence = "official" | "market_proxy" | "media_monitoring" | "model";

export type ContextIndicator = {
  id: string;
  label: string;
  symbol: string;
  value: number | null;
  unit: string;
  changeUnit?: string;
  change1d: number | null;
  change20d: number | null;
  change60d: number | null;
  asOf: string | null;
  evidence: ContextEvidence;
  status: ContextStatus;
};

export type ContextCountry = {
  countryId: string;
  name: string;
  region: string;
  signalValue: number | null;
  metricLabel: string;
  metricValue: number | null;
  metricUnit: string;
  secondaryLabel?: string;
  secondaryValue?: number | null;
  secondaryUnit?: string;
  role: string;
  detail: string;
  asOf: string;
  evidence: ContextEvidence;
};

export type ContextRoute = {
  id: string;
  name: string;
  region: string;
  value: number | null;
  unit: string;
  share: number | null;
  risk: "critical" | "elevated" | "structural";
  detail: string;
  asOf: string;
  evidence: ContextEvidence;
  coordinates?: [number, number];
};

export type ContextSignal = {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  tone: ContextTone;
  detail: string;
  asOf: string | null;
  evidence: ContextEvidence;
};

export type ContextStory = {
  title: string;
  url: string;
  domain: string;
  sourceCountry: string;
  language: string;
  publishedAt: string;
};

export type ContextSource = {
  id: string;
  name: string;
  organization: string;
  url: string;
  asOf: string;
  frequency: string;
  evidence: ContextEvidence;
};

export type ContextLayer = {
  id: ContextLayerId;
  status: ContextStatus;
  generatedAt: string;
  asOf: string;
  cadence: string;
  decision: {
    question: string;
    headline: string;
    summary: string;
    confidence: ContextConfidence;
  };
  indicators: ContextIndicator[];
  countries: ContextCountry[];
  routes: ContextRoute[];
  signals: ContextSignal[];
  stories: ContextStory[];
  sources: ContextSource[];
  methodology: string;
  caveat: string;
};

export type GlobalContextResponse = {
  generatedAt: string;
  layers: Record<ContextLayerId, ContextLayer>;
  errors: string[];
};

type GoldReserveRow = {
  countryId: string;
  name: string;
  region: string;
  tonnes: number | null;
  reserveShare: number | null;
  quarterlyChange: number | null;
};

export const GOLD_RESERVE_AS_OF = "2026-03-31";
export const GOLD_RESERVE_SOURCE = "https://www.gold.org/goldhub/data/gold-reserves-by-country";

export const GOLD_RESERVES: GoldReserveRow[] = [
  { countryId: "840", name: "美国", region: "北美", tonnes: 8133.46, reserveShare: 83.32, quarterlyChange: null },
  { countryId: "156", name: "中国", region: "东亚", tonnes: 2313.46, reserveShare: 9.14, quarterlyChange: 7.15 },
  { countryId: "392", name: "日本", region: "东亚", tonnes: 845.97, reserveShare: 9.12, quarterlyChange: null },
  { countryId: "356", name: "印度", region: "南亚", tonnes: 880.52, reserveShare: 18.51, quarterlyChange: null },
  { countryId: "076", name: "巴西", region: "拉美", tonnes: 172.44, reserveShare: 7.06, quarterlyChange: null },
  { countryId: "826", name: "英国", region: "西欧", tonnes: 310.29, reserveShare: 21, quarterlyChange: null },
  { countryId: "616", name: "波兰", region: "中东欧", tonnes: 581.64, reserveShare: 29.57, quarterlyChange: 31.43 },
  { countryId: "860", name: "乌兹别克斯坦", region: "中亚", tonnes: null, reserveShare: null, quarterlyChange: 25.19 },
  { countryId: "398", name: "哈萨克斯坦", region: "中亚", tonnes: null, reserveShare: null, quarterlyChange: 12.55 },
  { countryId: "203", name: "捷克", region: "中东欧", tonnes: null, reserveShare: null, quarterlyChange: 5.04 },
  { countryId: "792", name: "土耳其", region: "中东欧", tonnes: null, reserveShare: null, quarterlyChange: -79.45 },
  { countryId: "643", name: "俄罗斯", region: "中东欧", tonnes: null, reserveShare: null, quarterlyChange: -21.77 },
  { countryId: "100", name: "保加利亚", region: "中东欧", tonnes: null, reserveShare: null, quarterlyChange: -1.88 },
];

type EnergyExposureRow = {
  countryId: string;
  name: string;
  region: string;
  score: number;
  role: string;
  detail: string;
};

export const ENERGY_EXPOSURES: EnergyExposureRow[] = [
  { countryId: "840", name: "美国", region: "北美", score: 20, role: "生产与消费双重中心", detail: "本土供给缓冲较强，但成品油、炼化利润和全球定价仍受国际油价影响。" },
  { countryId: "124", name: "加拿大", region: "北美", score: 72, role: "净能源出口方", detail: "油砂和管道出口使其受益于供给溢价，同时高度依赖美国炼化与运输体系。" },
  { countryId: "076", name: "巴西", region: "拉美", score: 48, role: "海上原油出口方", detail: "深水油田提供出口弹性，国内燃料价格仍受炼化与汇率影响。" },
  { countryId: "826", name: "英国", region: "西欧", score: -28, role: "成熟产区与进口方", detail: "北海供给下降后进口依赖提高，油气价格通过电力与通胀向资产传导。" },
  { countryId: "276", name: "欧元区", region: "欧洲", score: -72, role: "高能源进口依赖", detail: "油气进口与工业用能暴露较高，航线绕行和天然气价格会放大制造业压力。" },
  { countryId: "392", name: "日本", region: "东亚", score: -92, role: "高进口依赖消费国", detail: "原油与 LNG 对海运依赖高，Hormuz 与 Malacca 是关键传导节点。" },
  { countryId: "156", name: "中国", region: "东亚", score: -76, role: "大型进口与炼化中心", detail: "进口规模大，Malacca、Hormuz 与绕行成本影响炼化、化工和运输链。" },
  { countryId: "356", name: "印度", region: "南亚", score: -78, role: "快速增长进口国", detail: "原油进口依赖高，价格与运费会传导至通胀、财政补贴和经常账户。" },
  { countryId: "410", name: "韩国", region: "东亚", score: -90, role: "炼化出口与原料进口国", detail: "大型炼化能力依赖进口原油，海运中断同时冲击成本与出口订单。" },
  { countryId: "158", name: "中国台湾", region: "东亚", score: -90, role: "高进口依赖制造中心", detail: "能源进口与关键制造负荷叠加，航运与电力成本是主要脆弱点。" },
  { countryId: "036", name: "澳大利亚", region: "亚太", score: 36, role: "LNG 出口与成品油进口方", detail: "天然气和煤炭出口提供顺风，但液体燃料进口与亚洲航线仍构成暴露。" },
];

export const ENERGY_CHOKEPOINT_AS_OF = "2025-06-30";
export const ENERGY_CHOKEPOINT_SOURCE = "https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints";

export const ENERGY_CHOKEPOINTS: ContextRoute[] = [
  { id: "malacca", name: "马六甲海峡", region: "印度洋—太平洋", value: 23.2, unit: "百万桶/日", share: 29, risk: "critical", detail: "全球最大石油运输咽喉，主要连接中东供给与东亚需求。", asOf: ENERGY_CHOKEPOINT_AS_OF, evidence: "official", coordinates: [101.4, 2.5] },
  { id: "hormuz", name: "霍尔木兹海峡", region: "波斯湾—阿拉伯海", value: 20.9, unit: "百万桶/日", share: 26, risk: "critical", detail: "约四分之一海运石油经过，现有绕行管道只能替代部分流量。", asOf: ENERGY_CHOKEPOINT_AS_OF, evidence: "official", coordinates: [56.3, 26.5] },
  { id: "cape", name: "好望角航线", region: "南部非洲", value: 9.1, unit: "百万桶/日", share: 11, risk: "elevated", detail: "不是狭窄咽喉，而是红海与运河受阻后的主要绕行路线。", asOf: ENERGY_CHOKEPOINT_AS_OF, evidence: "official", coordinates: [18.5, -34.4] },
  { id: "suez", name: "苏伊士运河与 SUMED", region: "红海—地中海", value: 4.9, unit: "百万桶/日", share: 6, risk: "elevated", detail: "连接海湾供给与欧洲，2024 年后流量约为 2023 年的一半。", asOf: ENERGY_CHOKEPOINT_AS_OF, evidence: "official", coordinates: [32.55, 30] },
  { id: "bab", name: "曼德海峡", region: "红海—亚丁湾", value: 4.2, unit: "百万桶/日", share: 5, risk: "critical", detail: "安全事件会迫使船舶绕行好望角，直接增加时间、保险与燃料成本。", asOf: ENERGY_CHOKEPOINT_AS_OF, evidence: "official", coordinates: [43.3, 12.6] },
  { id: "danish", name: "丹麦海峡", region: "波罗的海—北海", value: 4.9, unit: "百万桶/日", share: 6, risk: "structural", detail: "俄油制裁后流向亚洲与土耳其的结构变化提高了该通道的重要性。", asOf: ENERGY_CHOKEPOINT_AS_OF, evidence: "official", coordinates: [12.5, 55.7] },
  { id: "turkish", name: "土耳其海峡", region: "黑海—地中海", value: 3.7, unit: "百万桶/日", share: 5, risk: "elevated", detail: "承接俄罗斯与里海供给，航道狭窄且替代路径有限。", asOf: ENERGY_CHOKEPOINT_AS_OF, evidence: "official", coordinates: [29.1, 41] },
  { id: "panama", name: "巴拿马运河", region: "大西洋—太平洋", value: 2.3, unit: "百万桶/日", share: 3, risk: "structural", detail: "对美国成品油、LPG 与亚洲航线重要，水位限制会推高等待与绕行成本。", asOf: "2025-09-30", evidence: "official", coordinates: [-79.6, 9.1] },
];

type IndicatorDefinition = {
  id: string;
  label: string;
  symbol: string;
  unit: string;
  changeMode?: "percent" | "basis_points";
};

type YahooChartResponse = {
  chart: {
    result: Array<{
      meta: { currency?: string; regularMarketPrice?: number };
      timestamp: number[];
      indicators: { quote: Array<{ close: Array<number | null> }> };
    }> | null;
    error: { description?: string } | null;
  };
};

type WorldBankObservation = {
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
};

type GdeltArticleResponse = {
  articles?: Array<{
    title?: string;
    url?: string;
    domain?: string;
    sourcecountry?: string;
    language?: string;
    seendate?: string;
  }>;
};

const INDICATORS: Record<"gold" | "energy" | "trade", IndicatorDefinition[]> = {
  gold: [
    { id: "gold", label: "COMEX 黄金", symbol: "GC=F", unit: "USD/oz" },
    { id: "dollar", label: "美元指数", symbol: "DX-Y.NYB", unit: "点" },
    { id: "us10y", label: "美国10Y收益率", symbol: "^TNX", unit: "%", changeMode: "basis_points" },
    { id: "miners", label: "黄金矿业股", symbol: "GDX", unit: "USD" },
  ],
  energy: [
    { id: "brent", label: "Brent 原油", symbol: "BZ=F", unit: "USD/bbl" },
    { id: "wti", label: "WTI 原油", symbol: "CL=F", unit: "USD/bbl" },
    { id: "gas", label: "美国天然气", symbol: "NG=F", unit: "USD/MMBtu" },
    { id: "energyEquity", label: "能源股票", symbol: "XLE", unit: "USD" },
  ],
  trade: [
    { id: "dryBulk", label: "干散货运价代理", symbol: "BDRY", unit: "USD" },
    { id: "copper", label: "铜价", symbol: "HG=F", unit: "USD/lb" },
    { id: "emEquity", label: "新兴市场股票", symbol: "EEM", unit: "USD" },
    { id: "tradeDollar", label: "美元指数", symbol: "DX-Y.NYB", unit: "点" },
  ],
};

const GDELT_TOPICS = [
  { id: "sanctions", label: "制裁与出口管制", pattern: /sanction|export control/i },
  { id: "conflict", label: "军事升级", pattern: /military|conflict|war|attack/i },
  { id: "shipping", label: "航运中断", pattern: /shipping|maritime|blockade|strait|canal/i },
  { id: "tradePolicy", label: "关税与出口禁令", pattern: /tariff|export ban|trade war/i },
] as const;

const TRADE_COUNTRIES = ["US", "CA", "BR", "GB", "DE", "JP", "CN", "HK", "IN", "KR", "AU"];
const COUNTRY_IDS: Record<string, string> = {
  US: "840", CA: "124", BR: "076", GB: "826", DE: "276", JP: "392",
  CN: "156", HK: "156", IN: "356", KR: "410", AU: "036",
};
const COUNTRY_NAMES: Record<string, string> = {
  US: "美国", CA: "加拿大", BR: "巴西", GB: "英国", DE: "德国", JP: "日本",
  CN: "中国", HK: "中国香港", IN: "印度", KR: "韩国", AU: "澳大利亚",
};
const COUNTRY_REGIONS: Record<string, string> = {
  US: "北美", CA: "北美", BR: "拉美", GB: "欧洲", DE: "欧洲", JP: "东亚",
  CN: "东亚", HK: "东亚", IN: "南亚", KR: "东亚", AU: "亚太",
};

const TRADE_CORRIDORS: ContextRoute[] = [
  { id: "asia-europe", name: "亚洲—欧洲主航线", region: "Malacca—红海—Suez", value: null, unit: "", share: null, risk: "critical", detail: "制造品与能源共同穿越多个咽喉；红海受阻时通常绕行好望角。", asOf: ENERGY_CHOKEPOINT_AS_OF, evidence: "official" },
  { id: "us-asia", name: "美国湾岸—亚洲", region: "Panama / 好望角", value: null, unit: "", share: null, risk: "elevated", detail: "LPG、成品油和粮食对运河水位、船型与绕行成本敏感。", asOf: "2025-09-30", evidence: "official" },
  { id: "gulf-asia", name: "海湾—亚洲能源走廊", region: "Hormuz—Malacca", value: null, unit: "", share: null, risk: "critical", detail: "东亚与南亚的能源进口同时暴露于两个高流量咽喉。", asOf: ENERGY_CHOKEPOINT_AS_OF, evidence: "official" },
  { id: "cape-reroute", name: "好望角绕行", region: "南部非洲", value: 9.1, unit: "百万桶/日（油运）", share: 11, risk: "elevated", detail: "红海中断后的替代路线；更长航程会占用运力并增加燃料与保险成本。", asOf: ENERGY_CHOKEPOINT_AS_OF, evidence: "official" },
];

let cachedSnapshot: { timestamp: number; payload: GlobalContextResponse } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 2) {
  return +value.toFixed(digits);
}

function percentChange(current: number, previous: number | undefined) {
  if (previous == null || previous === 0) return null;
  return (current - previous) / Math.abs(previous) * 100;
}

async function fetchIndicator(definition: IndicatorDefinition): Promise<ContextIndicator> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(definition.symbol)}?range=6mo&interval=1d`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 WorldLedger/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${definition.id}: Yahoo ${response.status}`);
  const payload = await response.json() as YahooChartResponse;
  const result = payload.chart.result?.[0];
  if (!result || payload.chart.error) throw new Error(`${definition.id}: unavailable`);
  const closes = result.indicators.quote[0]?.close ?? [];
  const points = result.timestamp.flatMap((timestamp, index) => {
    const close = closes[index];
    return close == null ? [] : [{ date: new Date(timestamp * 1000).toISOString().slice(0, 10), close }];
  });
  if (points.length < 61) throw new Error(`${definition.id}: insufficient history`);
  const latest = points.at(-1)!;
  const change = (days: number) => {
    const previous = points.at(-(days + 1))?.close;
    if (previous == null) return null;
    return definition.changeMode === "basis_points"
      ? round((latest.close - previous) * 100, 0)
      : round(percentChange(latest.close, previous) ?? 0);
  };
  return {
    id: definition.id,
    label: definition.label,
    symbol: definition.symbol,
    value: round(result.meta.regularMarketPrice ?? latest.close, definition.changeMode === "basis_points" ? 2 : 3),
    unit: definition.unit,
    changeUnit: definition.changeMode === "basis_points" ? "bp" : "%",
    change1d: change(1),
    change20d: change(20),
    change60d: change(60),
    asOf: latest.date,
    evidence: "market_proxy",
    status: "ready",
  };
}

async function fetchTradeCountries(): Promise<ContextCountry[]> {
  const url = `https://api.worldbank.org/v2/country/${TRADE_COUNTRIES.join(";")}/indicator/NE.TRD.GNFS.ZS?format=json&per_page=100&date=2023:2025`;
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`world-bank: ${response.status}`);
  const payload = await response.json() as [unknown, WorldBankObservation[]];
  const observations = payload[1] ?? [];
  const latestByCountry = new Map<string, WorldBankObservation>();
  for (const observation of observations) {
    if (observation.value == null) continue;
    const current = latestByCountry.get(observation.country.id);
    if (!current || observation.date > current.date) latestByCountry.set(observation.country.id, observation);
  }
  return [...latestByCountry.entries()].map(([code, observation]) => ({
    countryId: COUNTRY_IDS[code],
    name: COUNTRY_NAMES[code] ?? observation.country.value,
    region: COUNTRY_REGIONS[code] ?? "其他",
    signalValue: round(clamp((Math.min(observation.value!, 150) - 25) / 1.25, 0, 100)),
    metricLabel: "贸易开放度",
    metricValue: round(observation.value!, 1),
    metricUnit: "% GDP",
    secondaryLabel: "数据年度",
    secondaryValue: Number(observation.date),
    secondaryUnit: "年",
    role: observation.value! >= 80 ? "高贸易依存" : observation.value! >= 45 ? "中等贸易依存" : "内需权重较高",
    detail: "进出口总额占 GDP 比重衡量结构暴露，不代表贸易顺差、订单方向或当期航运量。",
    asOf: observation.date,
    evidence: "official",
  }));
}

async function fetchGdeltStories(): Promise<ContextStory[]> {
  const query = '("economic sanctions" OR "export controls" OR "shipping disruption" OR "military escalation") sourcelang:english';
  const parameters = new URLSearchParams({ query, mode: "artlist", format: "json", maxrecords: "30", timespan: "3d", sort: "datedesc" });
  const response = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${parameters}`, {
    headers: { "User-Agent": "Mozilla/5.0 WorldLedger/1.0" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`gdelt-stories: ${response.status}`);
  const payload = await response.json() as GdeltArticleResponse;
  return (payload.articles ?? []).flatMap((article) => article.title && article.url ? [{
    title: article.title,
    url: article.url,
    domain: article.domain ?? "unknown",
    sourceCountry: article.sourcecountry ?? "unknown",
    language: article.language ?? "unknown",
    publishedAt: article.seendate ?? "",
  }] : []).slice(0, 20);
}

function signalsFromStories(stories: ContextStory[]): ContextSignal[] {
  if (!stories.length) return [];
  const latest = stories.map((story) => story.publishedAt).sort().at(-1)?.slice(0, 8) ?? null;
  return GDELT_TOPICS.map((topic) => {
    const count = stories.filter((story) => topic.pattern.test(story.title)).length;
    return {
      id: topic.id,
      label: topic.label,
      value: count,
      unit: `条 / ${stories.length}条样本`,
      tone: count >= 5 ? "warning" : count === 0 ? "neutral" : "positive",
      detail: "按最近3日GDELT相关报道样本标题分类；是媒体线索数，不是事件次数或风险概率。",
      asOf: latest,
      evidence: "media_monitoring",
    };
  });
}

function indicatorById(indicators: ContextIndicator[], id: string) {
  return indicators.find((indicator) => indicator.id === id);
}

function goldDecision(indicators: ContextIndicator[]) {
  const gold = indicatorById(indicators, "gold")?.change20d ?? 0;
  const dollar = indicatorById(indicators, "dollar")?.change20d ?? 0;
  const yieldChange = indicatorById(indicators, "us10y")?.change20d ?? 0;
  if (gold >= 3 && dollar <= -1) return {
    headline: "黄金与弱美元形成共振",
    summary: `黄金20日上涨 ${gold.toFixed(1)}%，美元同期回落 ${Math.abs(dollar).toFixed(1)}%。价格层支持货币对冲需求，但央行买入仍以季度数据确认。`,
  };
  if (gold >= 3 && yieldChange > 5) return {
    headline: "黄金逆利率上行走强",
    summary: `黄金20日上涨 ${gold.toFixed(1)}%，10年美债收益率同期变化 ${yieldChange.toFixed(0)}bp，说明价格强度不能只由利率下降解释。`,
  };
  if (gold <= -3) return {
    headline: "黄金价格动量转弱",
    summary: `黄金20日回落 ${Math.abs(gold).toFixed(1)}%，先观察美元与利率是否继续形成压力；季度储备变化不用于解释短期价格。`,
  };
  return {
    headline: "黄金驱动暂处于分化",
    summary: `黄金20日变化 ${gold.toFixed(1)}%，美元 ${dollar.toFixed(1)}%，美债收益率 ${yieldChange.toFixed(0)}bp，尚未形成单一驱动共振。`,
  };
}

function energyDecision(indicators: ContextIndicator[]) {
  const brent = indicatorById(indicators, "brent")?.change20d ?? 0;
  const energyEquity = indicatorById(indicators, "energyEquity")?.change20d ?? 0;
  if (brent >= 5 && energyEquity >= 2) return {
    headline: "油价与能源股共同走强",
    summary: `Brent 20日上涨 ${brent.toFixed(1)}%，能源股上涨 ${energyEquity.toFixed(1)}%，供给溢价获得股票价格确认。下一步看通道中断是否持续。`,
  };
  if (brent >= 5 && energyEquity < 0) return {
    headline: "油价冲击尚未获得能源股确认",
    summary: `Brent 20日上涨 ${brent.toFixed(1)}%，但能源股变化 ${energyEquity.toFixed(1)}%，可能是短期供给冲击或成本压力，需等待盈利预期确认。`,
  };
  if (brent <= -5) return {
    headline: "能源价格压力缓和",
    summary: `Brent 20日回落 ${Math.abs(brent).toFixed(1)}%，进口国成本压力边际下降；仍需区分需求走弱与供给改善。`,
  };
  return {
    headline: "能源价格处于区间分化",
    summary: `Brent 20日变化 ${brent.toFixed(1)}%，能源股 ${energyEquity.toFixed(1)}%，当前更适合从国家进口依赖与运输通道判断二阶影响。`,
  };
}

function tradeDecision(indicators: ContextIndicator[]) {
  const freight = indicatorById(indicators, "dryBulk")?.change20d ?? 0;
  const copper = indicatorById(indicators, "copper")?.change20d ?? 0;
  if (freight >= 3 && copper >= 3) return {
    headline: "运价与工业品共同改善",
    summary: `干散货代理20日上涨 ${freight.toFixed(1)}%，铜价上涨 ${copper.toFixed(1)}%，商品活动代理形成共振，但不等同于海关订单增长。`,
  };
  if (freight <= -3 && copper <= -3) return {
    headline: "贸易活动代理同步降温",
    summary: `干散货代理20日回落 ${Math.abs(freight).toFixed(1)}%，铜价回落 ${Math.abs(copper).toFixed(1)}%，需用后续海关和港口数据确认需求减速。`,
  };
  return {
    headline: "运价与工业需求信号分化",
    summary: `干散货代理20日变化 ${freight.toFixed(1)}%，铜价 ${copper.toFixed(1)}%，暂不输出贸易扩张或收缩结论。`,
  };
}

function statusFrom(indicators: ContextIndicator[], expected: number): ContextStatus {
  if (!indicators.length) return "partial";
  return indicators.length >= expected ? "ready" : "partial";
}

function buildGoldLayer(generatedAt: string, indicators: ContextIndicator[]): ContextLayer {
  const decision = goldDecision(indicators);
  const countries = GOLD_RESERVES.map((row): ContextCountry => ({
    countryId: row.countryId,
    name: row.name,
    region: row.region,
    signalValue: row.quarterlyChange == null ? null : round(clamp(row.quarterlyChange * 3, -100, 100)),
    metricLabel: "官方黄金储备",
    metricValue: row.tonnes,
    metricUnit: "吨",
    secondaryLabel: "Q1储备变化",
    secondaryValue: row.quarterlyChange,
    secondaryUnit: "吨",
    role: row.quarterlyChange == null ? "存量披露" : row.quarterlyChange > 0 ? "季度增持" : row.quarterlyChange < 0 ? "季度减持" : "季度持平",
    detail: row.reserveShare == null ? "仅披露季度变化，持有量与储备占比未在公开快照中展示。" : `黄金占官方外汇储备 ${row.reserveShare.toFixed(2)}%。`,
    asOf: GOLD_RESERVE_AS_OF,
    evidence: "official",
  }));
  const increases = countries.filter((country) => (country.secondaryValue ?? 0) > 0).sort((left, right) => (right.secondaryValue ?? 0) - (left.secondaryValue ?? 0));
  const decreases = countries.filter((country) => (country.secondaryValue ?? 0) < 0).sort((left, right) => (left.secondaryValue ?? 0) - (right.secondaryValue ?? 0));
  return {
    id: "gold",
    status: statusFrom(indicators, INDICATORS.gold.length),
    generatedAt,
    asOf: GOLD_RESERVE_AS_OF,
    cadence: "价格日频 · 储备季度/月频",
    decision: { question: "央行配置与市场价格是否同时强化黄金的货币对冲属性？", ...decision, confidence: indicators.length >= 3 ? "medium" : "low" },
    indicators,
    countries,
    routes: [],
    signals: [
      { id: "gold-buyers", label: "最大季度增持", value: increases[0]?.secondaryValue ?? null, unit: "吨", tone: "positive", detail: increases[0]?.name ?? "无公开数据", asOf: GOLD_RESERVE_AS_OF, evidence: "official" },
      { id: "gold-sellers", label: "最大季度减持", value: decreases[0]?.secondaryValue ?? null, unit: "吨", tone: "negative", detail: decreases[0]?.name ?? "无公开数据", asOf: GOLD_RESERVE_AS_OF, evidence: "official" },
    ],
    stories: [],
    sources: [
      { id: "wgc-reserves", name: "World Official Gold Reserves", organization: "World Gold Council / IMF IFS", url: GOLD_RESERVE_SOURCE, asOf: GOLD_RESERVE_AS_OF, frequency: "月度/季度", evidence: "official" },
      { id: "yahoo-gold", name: "黄金、美元、利率与矿业股日线", organization: "Yahoo Finance", url: "https://finance.yahoo.com/", asOf: indicators[0]?.asOf ?? generatedAt.slice(0, 10), frequency: "日频", evidence: "market_proxy" },
    ],
    methodology: "地图只用WGC明确披露的季度储备变化着色；储备吨数是存量，价格与美元、利率仅作为高频驱动验证。",
    caveat: "央行储备通常滞后两个月，未披露季度变化的国家保持无信号，绝不按持有量推断当期买入。",
  };
}

function buildEnergyLayer(generatedAt: string, indicators: ContextIndicator[]): ContextLayer {
  const decision = energyDecision(indicators);
  return {
    id: "energy",
    status: statusFrom(indicators, INDICATORS.energy.length),
    generatedAt,
    asOf: ENERGY_CHOKEPOINT_AS_OF,
    cadence: "价格日频 · 通道半年/事件更新",
    decision: { question: "能源价格变化来自需求、供给还是运输中断，哪些国家承受二阶冲击？", ...decision, confidence: indicators.length >= 3 ? "medium" : "low" },
    indicators,
    countries: ENERGY_EXPOSURES.map((row) => ({
      countryId: row.countryId,
      name: row.name,
      region: row.region,
      signalValue: row.score,
      metricLabel: "能源结构暴露",
      metricValue: row.score,
      metricUnit: "暴露分",
      role: row.role,
      detail: row.detail,
      asOf: ENERGY_CHOKEPOINT_AS_OF,
      evidence: "model",
    })),
    routes: ENERGY_CHOKEPOINTS,
    signals: [
      { id: "largest-route", label: "最大运输咽喉", value: ENERGY_CHOKEPOINTS[0].value, unit: ENERGY_CHOKEPOINTS[0].unit, tone: "warning", detail: ENERGY_CHOKEPOINTS[0].name, asOf: ENERGY_CHOKEPOINT_AS_OF, evidence: "official" },
      { id: "hormuz-bypass", label: "Hormuz可替代管道", value: 4.7, unit: "百万桶/日", tone: "warning", detail: "沙特与阿联酋现有绕行能力，仅能替代部分海峡流量。", asOf: ENERGY_CHOKEPOINT_AS_OF, evidence: "official" },
    ],
    stories: [],
    sources: [
      { id: "eia-chokepoints", name: "World Oil Transit Chokepoints", organization: "U.S. EIA", url: ENERGY_CHOKEPOINT_SOURCE, asOf: ENERGY_CHOKEPOINT_AS_OF, frequency: "半年/专题更新", evidence: "official" },
      { id: "yahoo-energy", name: "Brent、WTI、天然气与能源股日线", organization: "Yahoo Finance", url: "https://finance.yahoo.com/", asOf: indicators[0]?.asOf ?? generatedAt.slice(0, 10), frequency: "日频", evidence: "market_proxy" },
    ],
    methodology: "价格判断先比较Brent与能源股是否共振；地图暴露分只表达进口依赖与出口缓冲的结构方向，不代表实时净出口量。",
    caveat: "通道流量是EIA结构快照，突发中断需由官方航运与政府公告确认；价格上涨也可能来自需求改善。",
  };
}

function buildTradeLayer(generatedAt: string, indicators: ContextIndicator[], countries: ContextCountry[]): ContextLayer {
  const decision = tradeDecision(indicators);
  return {
    id: "trade",
    status: countries.length && indicators.length ? statusFrom(indicators, INDICATORS.trade.length) : "partial",
    generatedAt,
    asOf: countries.map((country) => country.asOf).sort().at(-1) ?? "2024",
    cadence: "市场代理日频 · 结构数据年度",
    decision: { question: "真实商品活动是否扩张，哪些高贸易依存经济体对航线与外需变化最敏感？", ...decision, confidence: indicators.length >= 2 && countries.length >= 8 ? "medium" : "low" },
    indicators,
    countries,
    routes: TRADE_CORRIDORS,
    signals: [
      { id: "open-economies", label: "高贸易依存样本", value: countries.filter((country) => (country.metricValue ?? 0) >= 80).length, unit: "个", tone: "neutral", detail: "贸易总额超过GDP 80%的样本市场", asOf: countries[0]?.asOf ?? null, evidence: "official" },
    ],
    stories: [],
    sources: [
      { id: "world-bank-trade", name: "Trade (% of GDP)", organization: "World Bank", url: "https://data.worldbank.org/indicator/NE.TRD.GNFS.ZS", asOf: countries.map((country) => country.asOf).sort().at(-1) ?? "2024", frequency: "年度", evidence: "official" },
      { id: "yahoo-trade", name: "干散货ETF、铜、美元与新兴市场日线", organization: "Yahoo Finance", url: "https://finance.yahoo.com/", asOf: indicators[0]?.asOf ?? generatedAt.slice(0, 10), frequency: "日频", evidence: "market_proxy" },
      { id: "eia-routes", name: "航线与能源运输结构", organization: "U.S. EIA", url: ENERGY_CHOKEPOINT_SOURCE, asOf: ENERGY_CHOKEPOINT_AS_OF, frequency: "专题更新", evidence: "official" },
    ],
    methodology: "高频层用干散货ETF与铜价观察活动代理，低频层用进出口总额/GDP刻画结构敏感度；两者不直接相加。",
    caveat: "BDRY是可交易ETF而非Baltic官方指数，贸易开放度也不代表顺差或订单方向，结论必须等待海关和港口数据确认。",
  };
}

function buildEventLayer(
  id: "events" | "geopolitics",
  generatedAt: string,
  signals: ContextSignal[],
  stories: ContextStory[],
  tradeCountries: ContextCountry[],
): ContextLayer {
  const highest = [...signals].sort((left, right) => (right.value ?? 0) - (left.value ?? 0))[0];
  const headline = highest && (highest.value ?? 0) > 0
    ? `${highest.label}是近期线索样本的主要主题`
    : "近期样本未形成可分类的单一主题";
  const summary = highest
    ? `${highest.label}在最近3日GDELT相关报道样本中有 ${highest.value ?? 0} 条。样本按标题分类，需回到官方公告确认事件、时间和影响范围。`
    : "GDELT监测暂不可用，当前只保留结构传导框架。";
  const energyByCountry = new Map(ENERGY_EXPOSURES.map((country) => [country.countryId, country]));
  const countries = id === "geopolitics" ? tradeCountries.map((country): ContextCountry => {
    const energy = energyByCountry.get(country.countryId);
    const tradeRisk = clamp((country.metricValue ?? 0) / 1.5, 0, 100);
    const energyRisk = energy ? Math.max(0, -energy.score) : 0;
    const score = round(tradeRisk * 0.45 + energyRisk * 0.55);
    return {
      ...country,
      signalValue: score,
      metricLabel: "结构传导暴露",
      metricValue: score,
      metricUnit: "模型分",
      secondaryLabel: "贸易开放度",
      secondaryValue: country.metricValue,
      secondaryUnit: "% GDP",
      role: score >= 70 ? "高结构暴露" : score >= 45 ? "中等结构暴露" : "相对缓冲",
      detail: `模型由贸易开放度45%与能源进口暴露55%构成；${energy?.detail ?? "能源结构数据有限。"}`,
      evidence: "model",
    };
  }) : [];
  return {
    id,
    status: stories.length ? "ready" : "partial",
    generatedAt,
    asOf: generatedAt.slice(0, 10),
    cadence: "15分钟至日频监测",
    decision: {
      question: id === "events" ? "哪些事件主题正在升温，下一步需要验证什么？" : "冲突、制裁和政策变化可能沿哪些资源与贸易链传导？",
      headline,
      summary,
      confidence: "low",
    },
    indicators: [],
    countries,
    routes: id === "geopolitics" ? ENERGY_CHOKEPOINTS.filter((route) => route.risk === "critical") : [],
    signals,
    stories,
    sources: [
      { id: "gdelt", name: "Global media coverage monitor", organization: "GDELT Project", url: "https://www.gdeltproject.org/", asOf: generatedAt.slice(0, 10), frequency: "15分钟", evidence: "media_monitoring" },
      ...(id === "geopolitics" ? [
        { id: "eia-geo-routes", name: "World Oil Transit Chokepoints", organization: "U.S. EIA", url: ENERGY_CHOKEPOINT_SOURCE, asOf: ENERGY_CHOKEPOINT_AS_OF, frequency: "专题更新", evidence: "official" as const },
        { id: "world-bank-geo", name: "Trade (% of GDP)", organization: "World Bank", url: "https://data.worldbank.org/indicator/NE.TRD.GNFS.ZS", asOf: tradeCountries.map((country) => country.asOf).sort().at(-1) ?? "2024", frequency: "年度", evidence: "official" as const },
      ] : []),
    ],
    methodology: id === "events"
      ? "单次读取最近3日GDELT相关文章样本，按标题将线索分为制裁、冲突、航运和关税四类，并保留原始链接供人工核验。"
      : "把媒体主题作为触发器，再用贸易开放度、能源进口暴露和关键通道识别潜在传导，不推断事件已发生或必然影响资产。",
    caveat: "GDELT是多语言媒体监测，存在重复、误分类与媒体偏差；文章标题只作线索，不能替代政府、央行、交易所或企业公告。",
  };
}

export async function buildGlobalContextSnapshot(options: { forceRefresh?: boolean } = {}): Promise<GlobalContextResponse> {
  if (!options.forceRefresh && cachedSnapshot && Date.now() - cachedSnapshot.timestamp < CACHE_TTL) return cachedSnapshot.payload;
  const generatedAt = new Date().toISOString();
  const errors: string[] = [];

  const fetchIndicators = async (layer: "gold" | "energy" | "trade") => {
    const settled = await Promise.allSettled(INDICATORS[layer].map(fetchIndicator));
    settled.forEach((result, index) => {
      if (result.status === "rejected") errors.push(`${layer}:${INDICATORS[layer][index].id}: unavailable`);
    });
    return settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  };

  const [goldIndicators, energyIndicators, tradeIndicators, tradeCountriesResult, gdeltStoriesResult] = await Promise.all([
    fetchIndicators("gold"),
    fetchIndicators("energy"),
    fetchIndicators("trade"),
    fetchTradeCountries().catch(() => { errors.push("trade:world-bank: unavailable"); return []; }),
    fetchGdeltStories().catch(() => { errors.push("events:gdelt-stories: unavailable"); return []; }),
  ]);
  const gdeltSignals = signalsFromStories(gdeltStoriesResult);

  const layers: Record<ContextLayerId, ContextLayer> = {
    gold: buildGoldLayer(generatedAt, goldIndicators),
    energy: buildEnergyLayer(generatedAt, energyIndicators),
    trade: buildTradeLayer(generatedAt, tradeIndicators, tradeCountriesResult),
    events: buildEventLayer("events", generatedAt, gdeltSignals, gdeltStoriesResult, tradeCountriesResult),
    geopolitics: buildEventLayer("geopolitics", generatedAt, gdeltSignals, gdeltStoriesResult, tradeCountriesResult),
  };
  const payload = { generatedAt, layers, errors };
  cachedSnapshot = { timestamp: Date.now(), payload };
  return payload;
}