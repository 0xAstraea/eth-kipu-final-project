// Compares two entries of gas-snapshot.json and prints the deltas.
// Usage: node scripts/gas-compare.mjs [baselineName] [variantName...]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const file = join(process.cwd(), "gas-snapshot.json");
const snapshot = JSON.parse(readFileSync(file, "utf8"));
const names = Object.keys(snapshot);
const baselineName = process.argv[2] ?? "baseline";
const variants = process.argv.length > 3 ? process.argv.slice(3) : names.filter((n) => n !== baselineName);

function load(name) {
  const entry = snapshot[name];
  if (!entry) {
    console.error(`no entry "${name}" in gas-snapshot.json (have: ${names.join(", ")})`);
    process.exit(1);
  }
  const map = new Map();
  for (const r of entry.rows) map.set(r.label, r.gas);
  return { map, flowTotal: entry.flowTotal, deployTotal: entry.deployTotal, sizes: entry.sizes };
}

const base = load(baselineName);
const fmt = (n) => n.toLocaleString("en-US");
const sign = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `-${fmt(-n)}` : "0");

console.log(`baseline: ${baselineName}\n`);
for (const v of variants) {
  const cur = load(v);
  console.log(`=== ${v} ===`);
  for (const [label, gas] of cur.map) {
    const b = base.map.get(label);
    if (b === undefined || b === gas) continue;
    const pct = ((gas - b) / b) * 100;
    console.log(
      `  ${label.padEnd(46)} ${fmt(b).padStart(11)} -> ${fmt(gas).padStart(11)}  ${sign(gas - b).padStart(11)} (${pct.toFixed(1)}%)`
    );
  }
  if (cur.flowTotal !== base.flowTotal) {
    console.log(
      `  ${"FLOW TOTAL".padEnd(46)} ${fmt(base.flowTotal).padStart(11)} -> ${fmt(cur.flowTotal).padStart(11)}  ${sign(cur.flowTotal - base.flowTotal).padStart(11)} (${(((cur.flowTotal - base.flowTotal) / base.flowTotal) * 100).toFixed(1)}%)`
    );
  }
  if (cur.deployTotal !== base.deployTotal) {
    console.log(
      `  ${"DEPLOY TOTAL".padEnd(46)} ${fmt(base.deployTotal).padStart(11)} -> ${fmt(cur.deployTotal).padStart(11)}  ${sign(cur.deployTotal - base.deployTotal).padStart(11)}`
    );
  }
  console.log(
    `  bytecode ${JSON.stringify(base.sizes)} -> ${JSON.stringify(cur.sizes)} (registry ${sign(cur.sizes.TeamRegistry - base.sizes.TeamRegistry)} bytes, credential ${sign(cur.sizes.TeamCredential - base.sizes.TeamCredential)} bytes)`
  );
  console.log("");
}
