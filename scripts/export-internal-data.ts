import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(projectRoot, "public", "data");
const sourceArgIndex = process.argv.indexOf("--source");
const source = (sourceArgIndex >= 0 ? process.argv[sourceArgIndex + 1] : null) ?? "http://localhost:3000";

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object response");
  return value as JsonObject;
}

async function fetchJson(pathname: string) {
  const response = await fetch(`${source}${pathname}`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`);
  return asObject(await response.json());
}

function withoutHistory(value: unknown) {
  const market = { ...asObject(value) };
  delete market.history;
  return market;
}

function sanitizeMarketFlows(payload: JsonObject) {
  const markets = Array.isArray(payload.markets) ? payload.markets.map(withoutHistory) : [];
  const byId = new Map(markets.map((market) => [market.id, market]));
  const summary = asObject(payload.summary);
  const strongest = asObject(summary.strongest);
  const weakest = asObject(summary.weakest);
  return {
    generatedAt: payload.generatedAt,
    source: payload.source,
    dataClass: payload.dataClass,
    methodology: payload.methodology,
    summary: {
      ...summary,
      strongest: byId.get(strongest.id) ?? withoutHistory(strongest),
      weakest: byId.get(weakest.id) ?? withoutHistory(weakest),
    },
    factorModel: payload.factorModel,
    markets,
    errors: Array.isArray(payload.errors) ? payload.errors.map(() => "区域行情源暂时不可用") : [],
  };
}

function sanitizeLedger(payload: JsonObject) {
  const sources = Array.isArray(payload.sources)
    ? payload.sources.map((value) => {
      const item = asObject(value);
      return {
        id: item.id,
        name: item.name,
        organization: item.organization,
        tier: item.tier,
        frequency: item.frequency,
        url: item.url,
        metadata: {},
      };
    })
    : [];
  return {
    market: payload.market,
    latestDate: payload.latestDate,
    dateCount: payload.dateCount,
    analysis: payload.analysis,
    coverage: payload.coverage,
    metrics: payload.metrics,
    quality: payload.quality,
    gaps: payload.gaps,
    sources,
  };
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(path.join(dataDir, "manifest.json"), "utf8")) as JsonObject;
  } catch {
    return { schemaVersion: 1, snapshots: {} };
  }
}

async function main() {
const [marketFlows, globalContext, mainlandLedger, hongKongLedger] = await Promise.all([
  fetchJson("/api/market-flows"),
  fetchJson("/api/global-context"),
  fetchJson("/api/global-capital?market=CN-A&days=120"),
  fetchJson("/api/global-capital?market=HK&days=120"),
]);
const sanitizedMarketFlows = sanitizeMarketFlows(marketFlows);
const sanitizedMainlandLedger = sanitizeLedger(mainlandLedger);
const sanitizedHongKongLedger = sanitizeLedger(hongKongLedger);
const existingManifest = await readManifest();
const snapshots = existingManifest.snapshots && typeof existingManifest.snapshots === "object"
  ? existingManifest.snapshots as JsonObject
  : {};

await mkdir(dataDir, { recursive: true });
await Promise.all([
  writeFile(path.join(dataDir, "market-flows.json"), `${JSON.stringify(sanitizedMarketFlows)}\n`),
  writeFile(path.join(dataDir, "global-context.json"), `${JSON.stringify(globalContext)}\n`),
  writeFile(path.join(dataDir, "global-capital-CN-A.json"), `${JSON.stringify(sanitizedMainlandLedger)}\n`),
  writeFile(path.join(dataDir, "global-capital-HK.json"), `${JSON.stringify(sanitizedHongKongLedger)}\n`),
  writeFile(path.join(dataDir, "manifest.json"), `${JSON.stringify({
    ...existingManifest,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceRevision: process.env.GITHUB_SHA ?? null,
    snapshots: {
      ...snapshots,
      marketFlows: { generatedAt: sanitizedMarketFlows.generatedAt, marketCount: sanitizedMarketFlows.markets.length },
      globalContext: { generatedAt: globalContext.generatedAt, layerCount: Object.keys(asObject(globalContext.layers)).length },
      mainlandLedger: { latestDate: sanitizedMainlandLedger.latestDate, status: "sanitized_snapshot" },
      hongKongLedger: { latestDate: sanitizedHongKongLedger.latestDate, status: "sanitized_snapshot" },
    },
  }, null, 2)}\n`),
]);

console.log(`Exported sanitized public snapshots from ${source}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});