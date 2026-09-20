import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = [path.join(projectRoot, "src"), path.join(projectRoot, "scripts")];
const forbidden = [
  { pattern: /@prisma|from ["'].*prisma|DATABASE_URL/g, label: "database dependency" },
  { pattern: /\bfutu\b|OpenD/gi, label: "private brokerage dependency" },
  { pattern: /child_process|execFile|spawn\(/g, label: "process execution" },
];
const violations = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(target);
    else if (entry.name !== "check-public-boundary.mjs" && /\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      const source = await readFile(target, "utf8");
      for (const rule of forbidden) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(source)) violations.push(`${path.relative(projectRoot, target)}: ${rule.label}`);
      }
    }
  }
}

for (const root of roots) await visit(root);
if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("Public boundary check passed");