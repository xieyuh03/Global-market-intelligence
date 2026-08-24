export type DatedFactorValue = {
  date: string;
  value: number;
};

export type FactorSeriesInput = {
  id: string;
  label: string;
  symbol: string;
  category: "global" | "macro" | "sector" | "currency";
  unit: "percent" | "basis_points";
  values: DatedFactorValue[];
};

export type FactorContribution = {
  id: string;
  label: string;
  symbol: string;
  category: FactorSeriesInput["category"];
  unit: FactorSeriesInput["unit"];
  beta: number;
  move20d: number;
  contribution20d: number;
};

export type MarketFactorDecomposition = {
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

type RegressionRow = {
  date: string;
  target: number;
  factors: number[];
};

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[], mean: number) {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function round(value: number, digits = 3) {
  return +value.toFixed(digits);
}

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];

    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const multiple = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= multiple * augmented[column][index];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function unavailable(sampleSize: number, windowDays: number): MarketFactorDecomposition {
  return {
    status: "insufficient",
    sampleSize,
    windowDays,
    rSquared: null,
    confidence: "unavailable",
    actual20d: null,
    explained20d: null,
    residual20d: null,
    baseline20d: null,
    dominantFactorId: null,
    factors: [],
  };
}

export function decomposeMarketReturns(
  target: DatedFactorValue[],
  factorSeries: FactorSeriesInput[],
  options: { windowDays?: number; recentDays?: number; ridgePenalty?: number; minimumSamples?: number } = {},
): MarketFactorDecomposition {
  const windowDays = options.windowDays ?? 120;
  const recentDays = options.recentDays ?? 20;
  const ridgePenalty = options.ridgePenalty ?? 2;
  const minimumSamples = options.minimumSamples ?? 80;
  if (!factorSeries.length) return unavailable(0, windowDays);

  const factorMaps = factorSeries.map((factor) => new Map(factor.values.map((point) => [point.date, point.value])));
  const rows: RegressionRow[] = target.flatMap((point) => {
    const values = factorMaps.map((points) => points.get(point.date));
    if (values.some((value) => value == null || !Number.isFinite(value))) return [];
    return [{ date: point.date, target: point.value, factors: values as number[] }];
  }).slice(-windowDays);

  if (rows.length < Math.max(minimumSamples, factorSeries.length * 6)) return unavailable(rows.length, windowDays);

  const targetValues = rows.map((row) => row.target);
  const targetMean = average(targetValues);
  const factorMeans = factorSeries.map((_, index) => average(rows.map((row) => row.factors[index])));
  const factorScales = factorSeries.map((_, index) => standardDeviation(rows.map((row) => row.factors[index]), factorMeans[index]));
  if (factorScales.some((scale) => scale < 1e-8)) return unavailable(rows.length, windowDays);

  const normalized = rows.map((row) => row.factors.map((value, index) => (value - factorMeans[index]) / factorScales[index]));
  const centeredTarget = targetValues.map((value) => value - targetMean);
  const factorCount = factorSeries.length;
  const crossProducts = Array.from({ length: factorCount }, (_, left) =>
    Array.from({ length: factorCount }, (_, right) =>
      normalized.reduce((sum, row) => sum + row[left] * row[right], 0) + (left === right ? ridgePenalty : 0),
    ),
  );
  const targetProducts = Array.from({ length: factorCount }, (_, index) =>
    normalized.reduce((sum, row, rowIndex) => sum + row[index] * centeredTarget[rowIndex], 0),
  );
  const normalizedBetas = solveLinearSystem(crossProducts, targetProducts);
  if (!normalizedBetas) return unavailable(rows.length, windowDays);

  const betas = normalizedBetas.map((beta, index) => beta / factorScales[index]);
  const intercept = targetMean - betas.reduce((sum, beta, index) => sum + beta * factorMeans[index], 0);
  const fitted = rows.map((row) => intercept + betas.reduce((sum, beta, index) => sum + beta * row.factors[index], 0));
  const totalSquares = targetValues.reduce((sum, value) => sum + (value - targetMean) ** 2, 0);
  const residualSquares = targetValues.reduce((sum, value, index) => sum + (value - fitted[index]) ** 2, 0);
  const rSquared = totalSquares > 0 ? Math.max(0, Math.min(1, 1 - residualSquares / totalSquares)) : 0;
  const recent = rows.slice(-recentDays);
  const factors = factorSeries.map((factor, index): FactorContribution => {
    const move20d = recent.reduce((sum, row) => sum + row.factors[index], 0);
    return {
      id: factor.id,
      label: factor.label,
      symbol: factor.symbol,
      category: factor.category,
      unit: factor.unit,
      beta: round(betas[index]),
      move20d: round(move20d),
      contribution20d: round(betas[index] * move20d),
    };
  });
  const actual20d = recent.reduce((sum, row) => sum + row.target, 0);
  const baseline20d = intercept * recent.length;
  const explained20d = baseline20d + factors.reduce((sum, factor) => sum + factor.contribution20d, 0);
  const dominantFactor = [...factors].sort((left, right) => Math.abs(right.contribution20d) - Math.abs(left.contribution20d))[0];
  const confidence = rows.length >= 100 && rSquared >= 0.55
    ? "high"
    : rows.length >= 90 && rSquared >= 0.3 ? "medium" : "low";

  return {
    status: "ready",
    sampleSize: rows.length,
    windowDays,
    rSquared: round(rSquared, 2),
    confidence,
    actual20d: round(actual20d),
    explained20d: round(explained20d),
    residual20d: round(actual20d - explained20d),
    baseline20d: round(baseline20d),
    dominantFactorId: dominantFactor?.id ?? null,
    factors,
  };
}