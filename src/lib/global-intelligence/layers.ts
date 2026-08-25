export type GlobalLayerId =
  | "capital"
  | "equities"
  | "gold"
  | "energy"
  | "trade"
  | "events"
  | "geopolitics";

export type GlobalLayerStatus = "live" | "planned";

export interface GlobalLayerDefinition {
  id: GlobalLayerId;
  label: string;
  shortLabel: string;
  status: GlobalLayerStatus;
  cadence: string;
  decisionQuestion: string;
  sourceHint: string;
}

export const GLOBAL_LAYERS: GlobalLayerDefinition[] = [
  {
    id: "capital",
    label: "全球资金",
    shortLabel: "资金",
    status: "live",
    cadence: "日频代理",
    decisionQuestion: "风险资金正在增配哪里、撤离哪里？",
    sourceHint: "区域 ETF 价格、动量与成交量；后续叠加 TIC、基金申赎和互联互通资金",
  },
  {
    id: "equities",
    label: "股票市场",
    shortLabel: "股市",
    status: "live",
    cadence: "日频",
    decisionQuestion: "全球股票市场的强弱扩散到了哪些国家？",
    sourceHint: "主要国家与地区代表 ETF 的 20 日价格动量",
  },
  {
    id: "gold",
    label: "黄金储备",
    shortLabel: "黄金",
    status: "live",
    cadence: "价格日频 · 储备季度/月频",
    decisionQuestion: "央行配置与市场价格是否同时强化黄金的货币对冲属性？",
    sourceHint: "World Gold Council / IMF IFS 储备快照、黄金价格、美元与美债收益率",
  },
  {
    id: "energy",
    label: "石油能源",
    shortLabel: "能源",
    status: "live",
    cadence: "价格日频 · 通道事件更新",
    decisionQuestion: "能源价格变化来自需求、供给还是运输中断，哪些国家承受二阶冲击？",
    sourceHint: "EIA 运输咽喉、Brent/WTI/天然气价格与国家进口依赖结构",
  },
  {
    id: "trade",
    label: "贸易航运",
    shortLabel: "贸易",
    status: "live",
    cadence: "市场日频 · 结构年度",
    decisionQuestion: "真实商品活动是否扩张，哪些高贸易依存经济体对外需最敏感？",
    sourceHint: "World Bank 贸易开放度、干散货ETF与铜价代理；等待海关和港口确认",
  },
  {
    id: "events",
    label: "国家事件",
    shortLabel: "事件",
    status: "live",
    cadence: "15分钟监测",
    decisionQuestion: "哪些高影响事件主题正在升温，下一步需要验证什么？",
    sourceHint: "GDELT 多语言报道强度与文章线索；事实以官方公告复核",
  },
  {
    id: "geopolitics",
    label: "国际形势",
    shortLabel: "地缘",
    status: "live",
    cadence: "事件驱动",
    decisionQuestion: "冲突、制裁和政策变化可能沿哪些资源与贸易链传导？",
    sourceHint: "GDELT 触发器 + EIA 通道 + World Bank 贸易结构；不替代官方事实确认",
  },
];

export function getGlobalLayer(id: GlobalLayerId) {
  return GLOBAL_LAYERS.find((layer) => layer.id === id) ?? GLOBAL_LAYERS[0];
}