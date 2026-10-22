export type CountryCode = "US" | "CN";

export interface MonetarySeriesRow {
  year: number;
  broadMoney: number;
  nominalGdp: number;
  realGdp: number;
}

export interface ModelWeights {
  supply: number;
  circulation: number;
  boundary: number;
}

export interface BoundaryInput {
  currentIndex: number;
  referenceIndex: number;
  currentLabel: string;
  referenceLabel: string;
  asOf: string;
  estimated: boolean;
  source: string;
  sourceUrl: string;
}

export interface CountryModelInput {
  code: CountryCode;
  name: string;
  currency: string;
  weights: ModelWeights;
  rows: MonetarySeriesRow[];
  boundary: BoundaryInput;
}

export interface HorizonGap {
  years: 1 | 3 | 5;
  weight: number;
  moneyGrowthPct: number;
  realOutputGrowthPct: number;
  gapPct: number;
}

export interface ScoreComponent {
  id: "supply" | "circulation" | "boundary";
  label: string;
  score: number;
  weight: number;
  contribution: number;
  formula: string;
  explanation: string;
}

export interface MonetaryHistoryPoint {
  year: number;
  broadMoney: number;
  nominalGdp: number;
  realGdp: number;
  moneyGrowthPct: number | null;
  realOutputGrowthPct: number | null;
  gapPct: number | null;
  outputPerMoney: number;
}

export interface CountryMonetaryScore {
  code: CountryCode;
  name: string;
  currency: string;
  asOf: string;
  score: number;
  matchScore: number;
  state: "severe-shortage" | "shortage" | "balanced" | "excess" | "severe-excess";
  stateLabel: string;
  summary: string;
  weights: ModelWeights;
  horizons: HorizonGap[];
  weightedGapPct: number;
  currentOutputPerMoney: number;
  normalOutputPerMoney: number;
  boundary: BoundaryInput;
  components: ScoreComponent[];
  history: MonetaryHistoryPoint[];
}

export interface MonetaryDashboardSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  methodology: {
    version: string;
    scoreRange: string;
    matchFormula: string;
    supplyFormula: string;
    circulationFormula: string;
    boundaryFormula: string;
    resultMetricsInScore: false;
  };
  countries: CountryMonetaryScore[];
  sources: Array<{
    name: string;
    organization: string;
    url: string;
    note: string;
  }>;
}

const HORIZONS: Array<{ years: 1 | 3 | 5; weight: number }> = [
  { years: 1, weight: 0.2 },
  { years: 3, weight: 0.5 },
  { years: 5, weight: 0.3 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function cagr(start: number, end: number, years: number) {
  if (start <= 0 || end <= 0) throw new Error("CAGR inputs must be positive");
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

function median(values: number[]) {
  if (values.length === 0) throw new Error("Cannot calculate a median without values");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function stateFor(score: number): Pick<CountryMonetaryScore, "state" | "stateLabel" | "summary"> {
  if (score > 60) {
    return {
      state: "severe-excess",
      stateLabel: "货币明显偏多",
      summary: "货币凭证明显快于当前承载能力，需确认压力已经进入商品、资产还是外汇。",
    };
  }
  if (score > 25) {
    return {
      state: "excess",
      stateLabel: "货币偏多",
      summary: "货币增长快于承载能力，但偏差可能仍被存款、资产或外部市场吸收。",
    };
  }
  if (score >= -25) {
    return {
      state: "balanced",
      stateLabel: "总体接近匹配",
      summary: "货币、真实生产和使用范围目前没有形成明显的单向失衡。",
    };
  }
  if (score >= -60) {
    return {
      state: "shortage",
      stateLabel: "货币偏少",
      summary: "真实生产和交易对货币的需求高于当前供给，通缩和偿债压力可能上升。",
    };
  }
  return {
    state: "severe-shortage",
    stateLabel: "货币明显不足",
    summary: "货币供给明显低于当前承载需求，交易收缩和债务压力需要优先关注。",
  };
}

export function calculateCountryMonetaryScore(input: CountryModelInput): CountryMonetaryScore {
  const rows = [...input.rows].sort((a, b) => a.year - b.year);
  if (rows.length < 10) throw new Error(`${input.code}: at least 10 annual observations are required`);

  const weightTotal = input.weights.supply + input.weights.circulation + input.weights.boundary;
  if (Math.abs(weightTotal - 1) > 0.0001) {
    throw new Error(`${input.code}: model weights must sum to 1`);
  }

  const latest = rows.at(-1);
  if (!latest) throw new Error(`${input.code}: no observations`);
  const byYear = new Map(rows.map((row) => [row.year, row]));

  const horizons = HORIZONS.map(({ years, weight }) => {
    const start = byYear.get(latest.year - years);
    if (!start) throw new Error(`${input.code}: missing ${latest.year - years} observation`);
    const moneyGrowthPct = cagr(start.broadMoney, latest.broadMoney, years);
    const realOutputGrowthPct = cagr(start.realGdp, latest.realGdp, years);
    return {
      years,
      weight,
      moneyGrowthPct: round(moneyGrowthPct, 2),
      realOutputGrowthPct: round(realOutputGrowthPct, 2),
      gapPct: round(moneyGrowthPct - realOutputGrowthPct, 2),
    };
  });

  const weightedGapPct = horizons.reduce((sum, item) => sum + item.gapPct * item.weight, 0);
  const supplyScore = clamp(weightedGapPct * 10, -100, 100);
  const ratioWindow = rows
    .filter((row) => row.year >= latest.year - 9)
    .map((row) => row.nominalGdp / row.broadMoney);
  const currentOutputPerMoney = latest.nominalGdp / latest.broadMoney;
  const normalOutputPerMoney = median(ratioWindow);
  const circulationScore = clamp(
    ((normalOutputPerMoney - currentOutputPerMoney) / normalOutputPerMoney / 0.3) * 100,
    -100,
    100,
  );
  const boundaryScore = clamp(
    (input.boundary.referenceIndex - input.boundary.currentIndex) * 10,
    -100,
    100,
  );

  const components: ScoreComponent[] = [
    {
      id: "supply",
      label: "货币与生产偏差",
      score: round(supplyScore),
      weight: input.weights.supply,
      contribution: round(supplyScore * input.weights.supply),
      formula: "广义货币增速 - 实际GDP增速",
      explanation: `1年、3年和5年偏差加权后为 ${round(weightedGapPct, 2)} 个百分点。`,
    },
    {
      id: "circulation",
      label: "货币流通偏差",
      score: round(circulationScore),
      weight: input.weights.circulation,
      contribution: round(circulationScore * input.weights.circulation),
      formula: "当期价格GDP ÷ 广义货币，与过去10年中间水平比较",
      explanation: `当前每单位货币支撑 ${round(currentOutputPerMoney, 3)} 单位年产出，过去10年中间水平为 ${round(normalOutputPerMoney, 3)}。`,
    },
    {
      id: "boundary",
      label: "货币市场边界偏差",
      score: round(boundaryScore),
      weight: input.weights.boundary,
      contribution: round(boundaryScore * input.weights.boundary),
      formula: "五年前国际使用指数 - 当前国际使用指数",
      explanation: `${input.boundary.referenceLabel}约 ${input.boundary.referenceIndex}，${input.boundary.currentLabel}约 ${input.boundary.currentIndex}${input.boundary.estimated ? "，为报告图表近似值" : ""}。`,
    },
  ];

  const score = round(components.reduce((sum, item) => sum + item.contribution, 0));
  const state = stateFor(score);
  const history = rows.map((row, index): MonetaryHistoryPoint => {
    const previous = rows[index - 1];
    const moneyGrowthPct = previous ? cagr(previous.broadMoney, row.broadMoney, 1) : null;
    const realOutputGrowthPct = previous ? cagr(previous.realGdp, row.realGdp, 1) : null;
    return {
      ...row,
      moneyGrowthPct: moneyGrowthPct == null ? null : round(moneyGrowthPct, 2),
      realOutputGrowthPct: realOutputGrowthPct == null ? null : round(realOutputGrowthPct, 2),
      gapPct: moneyGrowthPct == null || realOutputGrowthPct == null
        ? null
        : round(moneyGrowthPct - realOutputGrowthPct, 2),
      outputPerMoney: round(row.nominalGdp / row.broadMoney, 4),
    };
  });

  return {
    code: input.code,
    name: input.name,
    currency: input.currency,
    asOf: String(latest.year),
    score,
    matchScore: round(Math.max(0, 100 - Math.abs(score))),
    ...state,
    weights: input.weights,
    horizons,
    weightedGapPct: round(weightedGapPct, 2),
    currentOutputPerMoney: round(currentOutputPerMoney, 4),
    normalOutputPerMoney: round(normalOutputPerMoney, 4),
    boundary: input.boundary,
    components,
    history,
  };
}
