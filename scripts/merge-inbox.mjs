#!/usr/bin/env node
// Daily merge: inbox/YYYY-MM-DD.json -> jobs.json, then rebuild.
// Usage: node scripts/merge-inbox.mjs [--root DIR] [--now ISO] [--no-build]
// Inbox file = JSON array of records (jobs.json fields + validThrough + sourceUrl).
// - invalid records are rejected with reasons (not merged)
// - same id as an existing/earlier record -> skipped as duplicate
// - same posting URL (sourceUrl/applyUrl/url, tracking params ignored) + same company + same city + same title
//   (place words ignored) as an existing record (live OR expired) under a different id -> skipped as duplicate (urlDuplicates)
// - same normalized title+company+location, or same company+city with a different URL, under a different id
//   -> merged but FLAGGED as likely duplicate
// - processed files move to inbox/processed/ with a <file>.report.json next to them
// - unparseable files move to inbox/rejected/
// NEVER pushes. The publish step at the bottom is disabled unless OPJ_PUBLISH=1 AND you uncomment it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidDate, isValidDateOrDateTime, toIsoDateTime, EMP_ENUM, featuredProblems } from "./lib/jobs.mjs";
import { build } from "./build.mjs";

const FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isHttpUrl = (s) => { try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; } };
const nonEmpty = (s) => typeof s === "string" && s.trim().length > 0;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const dupKey = (j) => [j.title, j.company, j.location].map(norm).join("|");
// Tracking params that never identify a different job (others, e.g. ?jobId=, are kept).
const TRACKING = /^(utm_.*|source|src|ref|refid|referrer|trk|trackingid|gh_src|lever-source|lever-origin|fbclid|gclid|mc_cid|mc_eid)$/i;
export function normUrl(s) {
  try {
    const u = new URL(s);
    u.hash = "";
    const q = [...u.searchParams].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const qs = q.length ? "?" + new URLSearchParams(q).toString() : "";
    return (u.host.replace(/^www\./, "") + u.pathname).toLowerCase().replace(/\/+$/, "") + qs;
  } catch { return ""; }
}
// "Tampa, FL (hybrid)" / "Tampa, FL" / "Austin, TX area" -> "tampa"
export const cityKey = (loc) => norm(String(loc || "").split(/[,(/]/)[0].replace(/\b(area|greater|metro|hybrid|remote)\b/gi, ""));
const STATE_WORDS = new Set("alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada new hampshire jersey mexico york north carolina dakota ohio oklahoma oregon pennsylvania rhode island south tennessee texas utah vermont virginia washington west wisconsin wyoming al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy".split(" "));
// Title minus place words: "Licensed Public Adjuster – Destin, FL" -> "licensed public adjuster"
export const titleCore = (j) => {
  const place = new Set(norm(j.location).split(" "));
  return norm(j.title).split(" ").filter((w) => w && !place.has(w) && !STATE_WORDS.has(w)).join(" ");
};
const urlsOf = (j) => [...new Set([j.sourceUrl, j.applyUrl, j.url].filter(Boolean).map(normUrl).filter(Boolean))];

export function validateRecord(r, now) {
  const e = [];
  if (!r || typeof r !== "object" || Array.isArray(r)) return ["record is not an object"];
  if (!nonEmpty(r.id) || !ID_RE.test(r.id)) e.push("id must be a lowercase slug");
  for (const f of ["title", "company", "location", "type"]) if (!nonEmpty(r[f])) e.push(`${f} required`);
  if (!isValidDate(r.posted)) e.push("posted must be YYYY-MM-DD");
  if (!isHttpUrl(r.applyUrl)) e.push("applyUrl must be an http(s) URL");
  if (!isHttpUrl(r.sourceUrl)) e.push("sourceUrl must be an http(s) URL");
  if (!Array.isArray(r.description) || !r.description.length || !r.description.every(nonEmpty))
    e.push("description must be a non-empty array of strings");
  if (!isValidDateOrDateTime(r.validThrough)) e.push("validThrough must be ISO date or datetime");
  else {
    if (isValidDate(r.posted) && toIsoDateTime(r.validThrough) < r.posted) e.push("validThrough before posted");
    if (new Date(toIsoDateTime(r.validThrough)) < now) e.push("validThrough already in the past");
  }
  if (isValidDate(r.posted) && r.posted > now.toISOString().slice(0, 10)) e.push("posted is in the future");
  if (r.tags !== undefined && !(Array.isArray(r.tags) && r.tags.every(nonEmpty))) e.push("tags must be array of strings");
  for (const f of ["salary", "blurb", "logo", "companyUrl"]) if (r[f] !== undefined && typeof r[f] !== "string") e.push(`${f} must be a string`);
  if (r.employmentType !== undefined && ![].concat(r.employmentType).every((x) => EMP_ENUM.includes(x)))
    e.push("employmentType must be one of " + EMP_ENUM.join("/"));
  e.push(...featuredProblems(r));
  return e;
}

export function mergeRecords(existing, incoming, now) {
  const ids = new Set(existing.map((j) => j.id));
  const keys = new Map(existing.map((j) => [dupKey(j), j.id]));
  const byUrl = new Map(); // normUrl -> [records]
  const byCompanyCity = new Map(); // company|city -> id
  const index = (j) => {
    for (const u of urlsOf(j)) byUrl.set(u, [...(byUrl.get(u) || []), j]);
    const cc = norm(j.company) + "|" + cityKey(j.location);
    if (!byCompanyCity.has(cc)) byCompanyCity.set(cc, j.id);
  };
  existing.forEach(index);
  const added = [], rejected = [], duplicates = [], urlDuplicates = [], likelyDuplicates = [];
  incoming.forEach((r, i) => {
    const errs = validateRecord(r, now);
    if (errs.length) return rejected.push({ index: i, id: r?.id ?? null, reasons: errs });
    if (ids.has(r.id)) return duplicates.push({ index: i, id: r.id });
    // Same posting URL + same company + same city + same title = the same job under a new id.
    // (Generic URLs like a firm's /careers or /contact page are shared by different jobs, so URL alone isn't enough.)
    const sameJob = urlsOf(r).flatMap((u) => byUrl.get(u) || []).find((j) =>
      norm(j.company) === norm(r.company) && cityKey(j.location) === cityKey(r.location) && titleCore(j) === titleCore(r));
    if (sameJob) return urlDuplicates.push({ index: i, id: r.id, matches: sameJob.id });
    const k = dupKey(r);
    const cc = norm(r.company) + "|" + cityKey(r.location);
    if (keys.has(k)) likelyDuplicates.push({ id: r.id, matches: keys.get(k), key: k });
    else if (cityKey(r.location) && byCompanyCity.has(cc)) likelyDuplicates.push({ id: r.id, matches: byCompanyCity.get(cc), key: cc });
    const rec = { ...r, url: r.url || r.applyUrl };
    added.push(rec); ids.add(r.id); keys.set(k, r.id); index(rec);
  });
  return { jobs: [...existing, ...added], added: added.map((a) => a.id), rejected, duplicates, urlDuplicates, likelyDuplicates };
}

export function mergeInbox({ root, now = new Date(), runBuild = true, log = console.log } = {}) {
  root = root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const inbox = path.join(root, "inbox");
  const processed = path.join(inbox, "processed");
  const rejectedDir = path.join(inbox, "rejected");
  fs.mkdirSync(processed, { recursive: true });
  const jobsPath = path.join(root, "jobs.json");
  let jobs = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
  const files = fs.existsSync(inbox) ? fs.readdirSync(inbox).filter((f) => FILE_RE.test(f)).sort() : [];
  const summary = [];
  for (const f of files) {
    const src = path.join(inbox, f);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(src, "utf8"));
      if (!Array.isArray(data)) throw new Error("top level must be an array");
    } catch (err) {
      fs.mkdirSync(rejectedDir, { recursive: true });
      fs.renameSync(src, path.join(rejectedDir, f));
      log(`REJECTED FILE ${f}: ${err.message}`);
      summary.push({ file: f, fileError: err.message });
      continue;
    }
    const res = mergeRecords(jobs, data, now);
    jobs = res.jobs;
    const rep = { file: f, added: res.added, duplicates: res.duplicates, urlDuplicates: res.urlDuplicates, likelyDuplicates: res.likelyDuplicates, rejected: res.rejected };
    for (const r of res.rejected) log(`REJECT ${f}[${r.index}] ${r.id}: ${r.reasons.join("; ")}`);
    for (const d of res.duplicates) log(`SKIP duplicate id ${d.id} (${f}[${d.index}])`);
    for (const d of res.urlDuplicates) log(`SKIP duplicate posting URL ${d.id} = ${d.matches} (${f}[${d.index}])`);
    for (const d of res.likelyDuplicates) log(`FLAG likely duplicate ${d.id} ~ ${d.matches}`);
    log(`${f}: added ${res.added.length}, dup ${res.duplicates.length + res.urlDuplicates.length}, flagged ${res.likelyDuplicates.length}, rejected ${res.rejected.length}`);
    fs.writeFileSync(jobsPath, JSON.stringify(jobs, null, 2) + "\n"); // write before moving the file
    fs.renameSync(src, path.join(processed, f));
    fs.writeFileSync(path.join(processed, f.replace(/\.json$/, ".report.json")), JSON.stringify(rep, null, 2) + "\n");
    summary.push(rep);
  }
  const report = runBuild ? build({ root, now, log }) : null;

  // ---------------- PUBLISH (DISABLED) ----------------
  // Intentionally not executed. To publish, a human reviews the diff, then either runs these by hand
  // or sets OPJ_PUBLISH=1 *and* uncomments the block below.
  // if (process.env.OPJ_PUBLISH === "1") {
  //   const { execFileSync } = await import("node:child_process");
  //   execFileSync("git", ["add", "jobs.json", "jobs.active.json", "jobs", "index.html", "sitemap.xml", "data"], { cwd: root, stdio: "inherit" });
  //   execFileSync("git", ["commit", "-m", `jobs: daily merge ${now.toISOString().slice(0, 10)}`], { cwd: root, stdio: "inherit" });
  //   execFileSync("git", ["push", "origin", "main"], { cwd: root, stdio: "inherit" });
  // }
  if (process.env.OPJ_PUBLISH === "1") log("OPJ_PUBLISH=1 set, but publish step is commented out; nothing pushed.");
  return { summary, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const get = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const now = get("--now") || process.env.BUILD_NOW;
  mergeInbox({ root: get("--root"), now: now ? new Date(now) : new Date(), runBuild: !a.includes("--no-build") });
}
