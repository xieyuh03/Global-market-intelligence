export type CapitalMarketCode = "CN-A" | "HK";

export const publicSnapshotMode = process.env.NEXT_PUBLIC_MARKET_DATA_MODE === "snapshot";

function withBasePath(pathname: string) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${basePath}${pathname}`;
}

export function marketFlowsUrl() {
  return publicSnapshotMode ? withBasePath("/data/market-flows.json") : "/api/market-flows";
}

export function globalContextUrl() {
  return publicSnapshotMode ? withBasePath("/data/global-context.json") : "/api/global-context";
}

export function capitalLedgerUrl(market: CapitalMarketCode) {
  return publicSnapshotMode
    ? withBasePath(`/data/global-capital-${market}.json`)
    : `/api/global-capital?market=${market}&days=120`;
}

export function capitalRefreshUrl() {
  return "/api/global-capital/refresh?days=14";
}

export function withCurrentFreshness<T extends {
  latestDate: string | null;
  quality: { freshness: { ageDays: number | null; status: "fresh" | "stale" | "unavailable" } };
}>(payload: T): T {
  if (!payload.latestDate) {
    return {
      ...payload,
      quality: {
        ...payload.quality,
        freshness: { ageDays: null, status: "unavailable" },
      },
    };
  }

  const timestamp = new Date(`${payload.latestDate}T00:00:00Z`).getTime();
  const ageDays = Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000))
    : null;

  return {
    ...payload,
    quality: {
      ...payload.quality,
      freshness: {
        ageDays,
        status: ageDays == null ? "unavailable" : ageDays > 7 ? "stale" : "fresh",
      },
    },
  };
}