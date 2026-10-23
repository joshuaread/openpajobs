#!/usr/bin/env node
// Parse every JSON-LD block in jobs/*.html and check Google JobPosting required fields + expiry.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractJsonLd, checkGoogleJobPosting } from "./lib/jobs.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date(process.env.BUILD_NOW || Date.now());
let fail = 0, n = 0;
for (const f of fs.readdirSync(path.join(root, "jobs")).filter((f) => f.endsWith(".html")).sort()) {
  let blocks;
  try { blocks = extractJsonLd(fs.readFileSync(path.join(root, "jobs", f), "utf8")); }
  catch (e) { console.log(`FAIL ${f}: invalid JSON ${e.message}`); fail++; continue; }
  if (!blocks.length) { console.log(`--   ${f}: no JSON-LD`); continue; }
  for (const b of blocks) {
    n++;
    const p = checkGoogleJobPosting(b);
    if (new Date(b.validThrough) < now) p.push("expired validThrough");
    console.log(`${p.length ? "FAIL" : "ok  "} ${f}: ${p.join("; ") || `${b.jobLocationType || "onsite"} ${b.employmentType} validThrough=${b.validThrough}`}`);
    if (p.length) fail++;
  }
}
console.log(`${n} JSON-LD blocks, ${fail} failing`);
process.exit(fail ? 1 : 0);
