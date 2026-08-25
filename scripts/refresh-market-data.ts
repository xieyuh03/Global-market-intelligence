import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMarketSnapshot } from "../src/lib/market-data/build-market-snapshot";
import { buildGlobalContextSnapshot } from "../src/lib/global-intelligence/context-data";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(projectRoot, "public", "data");
const manifestPath = path.join(dataDir, "manifest.json");

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  } catch {
    return { schemaVersion: 1, snapshots: {} };
  }
}

async function main() {
const [payload, globalContext] = await Promise.all([
  buildMarketSnapshot(),
  buildGlobalContextSnapshot({ forceRefresh: true }),
]);
const generatedAt = (payload as { generatedAt?: string }).generatedAt ?? new Date().toISOString();
const marketCount = (payload as { markets?: unknown[] }).markets?.length ?? 0;
const manifest = await readManifest();
const snapshots = manifest.snapshots && typeof manifest.snapshots === "object" ? manifest.snapshots : {};

await mkdir(dataDir, { recursive: true });
await writeFile(path.join(dataDir, "market-flows.json"), `${JSON.stringify(payload)}\n`);
await writeFile(path.join(dataDir, "global-context.json"), `${JSON.stringify(globalContext)}\n`);
await writeFile(manifestPath, `${JSON.stringify({
  ...manifest,
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  snapshots: {
    ...snapshots,
    marketFlows: { generatedAt, marketCount, source: "Yahoo Finance 区域 ETF 日线" },
    globalContext: {
      generatedAt: globalContext.generatedAt,
      layers: Object.fromEntries(Object.entries(globalContext.layers).map(([id, layer]) => [id, {
        status: layer.status,
        asOf: layer.asOf,
      }])),
    },
  },
}, null, 2)}\n`);

console.log(`Wrote market snapshot for ${marketCount} markets and ${Object.keys(globalContext.layers).length} context layers at ${generatedAt}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});