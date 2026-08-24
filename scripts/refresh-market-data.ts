import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMarketSnapshot } from "../src/lib/market-data/build-market-snapshot";

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
const payload = await buildMarketSnapshot();
const generatedAt = (payload as { generatedAt?: string }).generatedAt ?? new Date().toISOString();
const marketCount = (payload as { markets?: unknown[] }).markets?.length ?? 0;
const manifest = await readManifest();
const snapshots = manifest.snapshots && typeof manifest.snapshots === "object" ? manifest.snapshots : {};

await mkdir(dataDir, { recursive: true });
await writeFile(path.join(dataDir, "market-flows.json"), `${JSON.stringify(payload)}\n`);
await writeFile(manifestPath, `${JSON.stringify({
  ...manifest,
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  snapshots: {
    ...snapshots,
    marketFlows: { generatedAt, marketCount, source: "Yahoo Finance 区域 ETF 日线" },
  },
}, null, 2)}\n`);

console.log(`Wrote market snapshot for ${marketCount} markets at ${generatedAt}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});