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
    status: "planned",
    cadence: "月频",
    decisionQuestion: "哪些央行在增持黄金，黄金从哪里流向哪里？",
    sourceHint: "IMF IFS、World Gold Council、各国央行储备披露",
  },
  {
    id: "energy",
    label: "石油能源",
    shortLabel: "能源",
    status: "planned",
    cadence: "周频",
    decisionQuestion: "供应中断会从哪条运输线传导到哪些消费国？",
    sourceHint: "EIA、JODI、OPEC、AIS 航运与战略储备披露",
  },
  {
    id: "trade",
    label: "贸易航运",
    shortLabel: "贸易",
    status: "planned",
    cadence: "月频",
    decisionQuestion: "真实商品流正在扩张还是收缩，关键航线是否堵塞？",
    sourceHint: "UN Comtrade、港口吞吐、海关、Baltic Exchange 与 AIS",
  },
  {
    id: "events",
    label: "国家事件",
    shortLabel: "事件",
    status: "planned",
    cadence: "实时",
    decisionQuestion: "哪些事件正在改变资金、资源或风险定价？",
    sourceHint: "政府公告、央行、交易所、权威通讯社与结构化事件库",
  },
  {
    id: "geopolitics",
    label: "国际形势",
    shortLabel: "地缘",
    status: "planned",
    cadence: "事件驱动",
    decisionQuestion: "冲突、制裁和政策变化会沿哪条链影响资产？",
    sourceHint: "制裁清单、军事与外交公告、贸易限制及供应链暴露",
  },
];

export function getGlobalLayer(id: GlobalLayerId) {
  return GLOBAL_LAYERS.find((layer) => layer.id === id) ?? GLOBAL_LAYERS[0];
}