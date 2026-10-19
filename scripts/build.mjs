#!/usr/bin/env node
// Open PA Jobs static build: jobs.json -> jobs/*.html (+JobPosting JSON-LD), jobs.active.json,
// index.html crawlable fallback list, sitemap.xml (with lastmod), build-report.json.
// Usage: node scripts/build.mjs [--root DIR] [--now 2026-10-12T00:00:00Z]
// No npm deps. Deterministic for a given (jobs.json, --now, data/lastmod.json).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  SITE, esc, isExpired, resolveValidThrough, renderJobPage, buildJsonLd, jsonLdSkipReason,
  missingRequired, extractJsonLd, checkGoogleJobPosting,
} from "./lib/jobs.mjs";

const NOINDEX_IDS = new Set(["founding-placeholder"]);

export function renderRedirectPage(job, target) {
  const href = `/jobs/${target.id}.html`;
  const abs = `${SITE}${href}`;
  const label = `${target.title} at ${target.company}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>This listing has moved — Open PA Jobs</title>
  <meta name="robots" content="noindex, follow" />
  <link rel="canonical" href="${esc(abs)}" />
  <meta http-equiv="refresh" content="0; url=${esc(href)}" />
  <script>location.replace(${JSON.stringify(href)});</script>
</head>
<body>
  <p>This listing (${esc(job.title)}, ${esc(job.company)}) has been replaced by
  <a href="${esc(href)}">${esc(label)}</a>.</p>
  <p><a href="/#jobs">Browse all public adjuster jobs</a></p>
</body>
</html>
`;
}

export function build({ root, now = new Date(), log = console.log } = {}) {
  root = root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const today = now.toISOString().slice(0, 10);
  const jobs = JSON.parse(fs.readFileSync(path.join(root, "jobs.json"), "utf8"));
  const active = [], expired = [];
  for (const j of jobs) (isExpired(j, now) ? expired : active).push(j);

  const report = {
    buildDate: today,
    total: jobs.length, active: active.length, droppedExpired: expired.map((j) => j.id),
    jsonLdEmitted: [], jsonLdSkipped: {}, defaultedValidThrough: [], missingFields: {}, validation: {},
    removedPages: [],
  };
  for (const j of jobs) {
    const vt = resolveValidThrough(j);
    if (vt?.defaulted) report.defaultedValidThrough.push({ id: j.id, validThrough: vt.value, rule: "posted + 60 days" });
    const miss = missingRequired(j);
    if (!j.validThrough) miss.push("validThrough (not in data; defaulted)");
    if (miss.length) report.missingFields[j.id] = miss;
  }

  // --- job pages ---
  const jobsDir = path.join(root, "jobs");
  fs.mkdirSync(jobsDir, { recursive: true });
  const keep = new Set(active.map((j) => `${j.id}.html`));
  // Retired listings with `redirectTo` (id of an active job) keep their URL as a noindex redirect stub,
  // so old links land on the replacement posting instead of a 404. Never in the sitemap or board feed.
  const activeById = new Map(active.map((j) => [j.id, j]));
  const redirects = expired.filter((j) => j.redirectTo && activeById.has(j.redirectTo));
  for (const j of expired) if (j.redirectTo && !activeById.has(j.redirectTo)) log(`redirect: ${j.id} -> ${j.redirectTo} skipped (target not active); page removed`);
  for (const j of redirects) keep.add(`${j.id}.html`);
  report.redirects = Object.fromEntries(redirects.map((j) => [j.id, j.redirectTo]));
  for (const f of fs.readdirSync(jobsDir).sort()) {
    if (f.endsWith(".html") && !keep.has(f)) { fs.unlinkSync(path.join(jobsDir, f)); report.removedPages.push(`jobs/${f}`); }
  }
  for (const j of active) {
    const html = renderJobPage(j, active);
    fs.writeFileSync(path.join(jobsDir, `${j.id}.html`), html);
    const blocks = extractJsonLd(html); // re-parse what we actually wrote
    if (blocks.length) {
      report.jsonLdEmitted.push(j.id);
      const probs = blocks.flatMap(checkGoogleJobPosting);
      report.validation[j.id] = probs.length ? probs : "ok";
    } else report.jsonLdSkipped[j.id] = jsonLdSkipReason(j);
  }

  for (const j of redirects) fs.writeFileSync(path.join(jobsDir, `${j.id}.html`), renderRedirectPage(j, activeById.get(j.redirectTo)));

  // --- public feed for the client-side board (expired jobs never reach the browser) ---
  fs.writeFileSync(path.join(root, "jobs.active.json"), JSON.stringify(active, null, 2) + "\n");

  // --- index.html crawlable fallback (noscript, so the visible board is unchanged) ---
  const idxPath = path.join(root, "index.html");
  let idx = fs.readFileSync(idxPath, "utf8");
  const sorted = [...active].sort((a, b) => (b.posted || "").localeCompare(a.posted || "") || a.id.localeCompare(b.id));
  const list =
    "<!--JOBS:START--><noscript><ul class=\"jobs-static\">" +
    sorted.map((j) => `<li><a href="/jobs/${esc(j.id)}.html">${esc(j.title)}</a> — ${esc(j.company)} · ${esc(j.location)}</li>`).join("") +
    "</ul></noscript><!--JOBS:END-->";
  if (idx.includes("<!--JOBS:START-->")) idx = idx.replace(/<!--JOBS:START-->[\s\S]*?<!--JOBS:END-->/, list);
  else idx = idx.replace('<div class="jobs" id="job-list" aria-live="polite"></div>', `<div class="jobs" id="job-list" aria-live="polite">${list}</div>`);
  fs.writeFileSync(idxPath, idx);

  // --- sitemap ---
  const smPath = path.join(root, "sitemap.xml");
  const old = fs.existsSync(smPath) ? fs.readFileSync(smPath, "utf8") : "";
  const oldLocs = [...old.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const staticLocs = oldLocs.filter((u) => !u.startsWith(`${SITE}/jobs/`));
  // lastmod for non-job pages: content hash manifest; date only moves when the file changes.
  const lmPath = path.join(root, "data", "lastmod.json");
  const lm = fs.existsSync(lmPath) ? JSON.parse(fs.readFileSync(lmPath, "utf8")) : {};
  const nextLm = {};
  const entries = [];
  for (const loc of staticLocs) {
    let rel = loc.slice(SITE.length + 1) || "index.html";
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp)) { log(`sitemap: dropping ${loc} (file missing)`); continue; }
    const hash = crypto.createHash("sha256").update(fs.readFileSync(fp)).digest("hex");
    const date = lm[rel]?.hash === hash ? lm[rel].lastmod : today;
    nextLm[rel] = { hash, lastmod: date };
    entries.push([loc, date]);
  }
  for (const j of active) {
    if (NOINDEX_IDS.has(j.id)) continue; // noindex pages don't belong in the sitemap
    entries.push([`${SITE}/jobs/${j.id}.html`, j.updated && j.updated > j.posted ? j.updated : j.posted]);
  }
  fs.mkdirSync(path.dirname(lmPath), { recursive: true });
  fs.writeFileSync(lmPath, JSON.stringify(nextLm, null, 2) + "\n");
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map(([u, d]) => `  <url>\n    <loc>${esc(u)}</loc>\n    <lastmod>${d}</lastmod>\n  </url>\n`).join("") +
    "</urlset>\n";
  fs.writeFileSync(smPath, xml);
  report.sitemapUrls = entries.length;

  fs.writeFileSync(path.join(root, "build-report.json"), JSON.stringify(report, null, 2) + "\n");
  const bad = Object.entries(report.validation).filter(([, v]) => v !== "ok");
  log(`build ${today}: total=${report.total} active=${report.active} jsonld=${report.jsonLdEmitted.length} ` +
      `skipped=${Object.keys(report.jsonLdSkipped).length} expired=${expired.length} removed=${report.removedPages.length} sitemap=${entries.length}`);
  if (bad.length) throw new Error("JSON-LD validation failed: " + JSON.stringify(bad));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const get = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const now = get("--now") || process.env.BUILD_NOW;
  build({ root: get("--root"), now: now ? new Date(now) : new Date() });
}
