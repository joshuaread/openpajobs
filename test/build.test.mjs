import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../scripts/build.mjs";
import { mergeInbox, validateRecord } from "../scripts/merge-inbox.mjs";
import { buildJsonLd, extractJsonLd, checkGoogleJobPosting, safeJson } from "../scripts/lib/jobs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIX = path.join(ROOT, "test", "fixtures");
const NOW = new Date("2026-10-12T22:00:00Z");
const quiet = () => {};

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opj-"));
  for (const f of fs.readdirSync(ROOT)) {
    if (["test", "inbox", "node_modules", "_gen", "ref"].includes(f)) continue;
    fs.cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, "inbox"), { recursive: true });
  return dir;
}
const ld = (dir, id) => extractJsonLd(fs.readFileSync(path.join(dir, "jobs", `${id}.html`), "utf8"));

test("JSON-LD has Google fields for onsite and remote jobs", () => {
  const dir = sandbox();
  build({ root: dir, now: NOW, log: quiet });
  const [onsite] = ld(dir, "rockwall-austin");
  assert.equal(onsite["@type"], "JobPosting");
  assert.deepEqual(checkGoogleJobPosting(onsite), []);
  assert.equal(onsite.jobLocation.address.addressLocality, "Austin");
  assert.equal(onsite.jobLocation.address.addressRegion, "TX");
  assert.equal(onsite.jobLocation.address.addressCountry, "US");
  assert.equal(onsite.directApply, false);
  assert.match(onsite.validThrough, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(onsite.description, /^<p>/);
  const [remote] = ld(dir, "coastal-ctg");
  assert.equal(remote.jobLocationType, "TELECOMMUTE");
  assert.equal(remote.applicantLocationRequirements["@type"], "Country");
  assert.equal(remote.employmentType, "CONTRACTOR");
  assert.equal(remote.baseSalary.value.minValue, 80000);
  // jsonld:false records (multi-role pointers) get no JSON-LD
  assert.equal(ld(dir, "aaa-pa").length, 0);
  // no salary in data -> no baseSalary
  const noSal = { id: "n", title: "T", company: "C", location: "Austin, TX", type: "x", posted: "2026-10-01",
    applyUrl: "https://example.com", description: ["d"] };
  assert.equal(buildJsonLd(noSal).baseSalary, undefined);
  // placeholder & no-location jobs get no JSON-LD
  assert.equal(ld(dir, "founding-placeholder").length, 0);
  assert.equal(ld(dir, "statewide-pa").length, 0);
});

test("JSON-LD is </script>-injection safe and round-trips", () => {
  const job = { id: "x", title: "T</script><script>alert(1)</script>", company: "C & D", location: "Austin, TX",
    type: "Full-time", posted: "2026-10-01", validThrough: "2026-12-01", applyUrl: "https://example.com",
    description: ["a </script> b \u2028 c"] };
  const s = safeJson(buildJsonLd(job));
  assert.ok(!s.includes("</script"));
  assert.ok(!s.includes("\u2028"));
  assert.equal(JSON.parse(s).title, job.title);
});

test("expired listings are dropped and their pages removed", () => {
  const dir = sandbox();
  const r = build({ root: dir, now: NOW, log: quiet });
  assert.ok(r.droppedExpired.includes("fapia-board"));
  assert.ok(!fs.existsSync(path.join(dir, "jobs", "fapia-board.html")));
  const sm = fs.readFileSync(path.join(dir, "sitemap.xml"), "utf8");
  assert.ok(!sm.includes("fapia-board"));
  assert.ok(sm.includes("<loc>https://openpajobs.com/about.html</loc>"));
  assert.ok(!JSON.parse(fs.readFileSync(path.join(dir, "jobs.active.json"))).some((j) => j.id === "fapia-board"));
  // far future: everything defaulted expires
  const r2 = build({ root: dir, now: new Date("2027-06-01T00:00:00Z"), log: quiet });
  assert.equal(r2.active, 0);
});

test("build is deterministic", () => {
  const dir = sandbox();
  build({ root: dir, now: NOW, log: quiet });
  const snap = () => ["sitemap.xml", "index.html", "jobs.active.json", "jobs/coastal-ctg.html"].map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
  const a = snap();
  build({ root: dir, now: NOW, log: quiet });
  assert.deepEqual(snap(), a);
});

test("merge: adds new, skips same id, flags likely duplicate, rejects malformed, moves files", () => {
  const dir = sandbox();
  for (const f of fs.readdirSync(FIX)) fs.copyFileSync(path.join(FIX, f), path.join(dir, "inbox", f));
  fs.writeFileSync(path.join(dir, "inbox", "2026-10-13.json"), "{ not json");
  const { summary } = mergeInbox({ root: dir, now: NOW, log: quiet });
  const [d1, d2, bad] = summary;
  assert.deepEqual(d1.added, ["fake-acme-licensed-pa-tampa", "fake-remote-ctg"]);
  assert.deepEqual(d1.duplicates.map((d) => d.id), ["coastal-ctg"]);
  assert.deepEqual(d2.added, ["fake-acme-licensed-pa-tampa-2"]);
  assert.equal(d2.likelyDuplicates[0].matches, "fake-acme-licensed-pa-tampa");
  assert.equal(d2.rejected.length, 4);
  const reasons = d2.rejected.map((r) => r.reasons.join(";")).join("\n");
  for (const s of ["id must be", "title required", "posted must be", "applyUrl", "sourceUrl", "description", "validThrough must", "already in the past", "not an object", "employmentType"])
    assert.ok(reasons.includes(s), s);
  assert.ok(bad.fileError);
  assert.ok(fs.existsSync(path.join(dir, "inbox", "processed", "2026-10-11.json")));
  assert.ok(fs.existsSync(path.join(dir, "inbox", "rejected", "2026-10-13.json")));
  assert.ok(!fs.existsSync(path.join(dir, "inbox", "2026-10-11.json")));
  const jobs = JSON.parse(fs.readFileSync(path.join(dir, "jobs.json")));
  assert.equal(jobs.filter((j) => j.id === "coastal-ctg").length, 1);
  assert.equal(jobs.find((j) => j.id === "coastal-ctg").company, "Coastal Claims Services");
  // built pages for merged jobs, valid JSON-LD, sourceUrl attribution visible
  const [x] = ld(dir, "fake-acme-licensed-pa-tampa");
  assert.deepEqual(checkGoogleJobPosting(x), []);
  assert.equal(x.employmentType, "FULL_TIME");
  assert.equal(x.validThrough, "2026-12-10T23:59:59Z");
  const html = fs.readFileSync(path.join(dir, "jobs", "fake-acme-licensed-pa-tampa.html"), "utf8");
  assert.ok(html.includes("https://example.com/fake/source/1"));
  assert.equal((html.match(/<\/script>/g) || []).length, (html.match(/<script/g) || []).length);
  // re-running with no inbox files is a no-op on jobs.json
  const before = fs.readFileSync(path.join(dir, "jobs.json"), "utf8");
  mergeInbox({ root: dir, now: NOW, log: quiet });
  assert.equal(fs.readFileSync(path.join(dir, "jobs.json"), "utf8"), before);
});

test("validateRecord accepts a good record", () => {
  const good = JSON.parse(fs.readFileSync(path.join(FIX, "2026-10-11.json")))[0];
  assert.deepEqual(validateRecord(good, NOW), []);
});

test("retired listings with redirectTo keep a noindex redirect stub to the active replacement", () => {
  const dir = sandbox();
  const p = path.join(dir, "jobs.json");
  const jobs = JSON.parse(fs.readFileSync(p, "utf8"));
  jobs.find((j) => j.id === "fapia-board").redirectTo = "rockwall-austin";
  fs.writeFileSync(p, JSON.stringify(jobs));
  const r = build({ root: dir, now: NOW, log: quiet });
  assert.equal(r.redirects["fapia-board"], "rockwall-austin");
  const html = fs.readFileSync(path.join(dir, "jobs", "fapia-board.html"), "utf8");
  assert.match(html, /http-equiv="refresh" content="0; url=\/jobs\/rockwall-austin\.html"/);
  assert.match(html, /name="robots" content="noindex/);
  assert.equal(extractJsonLd(html).length, 0);
  assert.ok(!fs.readFileSync(path.join(dir, "sitemap.xml"), "utf8").includes("fapia-board"));
  assert.ok(!JSON.parse(fs.readFileSync(path.join(dir, "jobs.active.json"))).some((j) => j.id === "fapia-board"));
});

// ---------- paid Featured listings ----------
const FEATURE_URL = "https://buy.stripe.com/7sY4gA1gg3X70W24PLd3i02";
const FEATURE_LABEL = "Feature your listing — $49 for 30 days";

function featuredSandbox(overrides) {
  const dir = sandbox();
  const p = path.join(dir, "jobs.json");
  const jobs = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const [id, o] of Object.entries(overrides)) Object.assign(jobs.find((j) => j.id === id), o);
  fs.writeFileSync(p, JSON.stringify(jobs, null, 2));
  return dir;
}
const page = (dir, id) => fs.readFileSync(path.join(dir, "jobs", `${id}.html`), "utf8");
const idxOrder = (dir) =>
  [...fs.readFileSync(path.join(dir, "index.html"), "utf8").matchAll(/<li><a href="\/jobs\/([^"]+)\.html"/g)].map((m) => m[1]);

test("featured_until is inclusive of its day; expired or undated featured is not featured", () => {
  const dir = featuredSandbox({
    "rockwall-austin": { featured: true, featured_until: "2026-10-12" }, // today (NOW is 2026-10-12 22:00Z)
    "coastal-ctg": { featured: true, featured_until: "2026-10-11" }, // yesterday
    "avalo-pa-1099": { featured: true }, // no end date -> fail closed
    "aaa-pa": { featured: false, featured_until: "2027-01-01" }, // not opted in
  });
  const report = build({ root: dir, now: NOW, log: quiet });
  assert.deepEqual(report.featuredNow, ["rockwall-austin"]);
  assert.ok(report.featuredProblems["avalo-pa-1099"]);
  assert.match(page(dir, "rockwall-austin"), /class="job-badge is-featured job-page-featured"/);
  for (const id of ["coastal-ctg", "avalo-pa-1099", "aaa-pa"]) assert.doesNotMatch(page(dir, id), /is-featured/);
  assert.equal(idxOrder(dir)[0], "rockwall-austin");
});

test("a featured listing drops off after featured_until with no data edit (only a rebuild)", () => {
  const dir = featuredSandbox({ "rockwall-austin": { featured: true, featured_until: "2026-10-12" } });
  build({ root: dir, now: NOW, log: quiet });
  assert.match(page(dir, "rockwall-austin"), /is-featured/);
  assert.equal(idxOrder(dir)[0], "rockwall-austin");
  build({ root: dir, now: new Date("2026-10-13T00:00:01Z"), log: quiet });
  assert.doesNotMatch(page(dir, "rockwall-austin"), /is-featured/);
  assert.notEqual(idxOrder(dir)[0], "rockwall-austin");
});

test("every listing page has the Feature button (new tab); JSON-LD stays valid and identical for featured jobs", () => {
  const dir = featuredSandbox({});
  build({ root: dir, now: NOW, log: quiet });
  const plainLd = ld(dir, "rockwall-austin");
  const dir2 = featuredSandbox({ "rockwall-austin": { featured: true, featured_until: "2026-11-12" } });
  build({ root: dir2, now: NOW, log: quiet });
  assert.deepEqual(ld(dir2, "rockwall-austin"), plainLd);
  assert.deepEqual(checkGoogleJobPosting(ld(dir2, "rockwall-austin")[0]), []);
  for (const f of fs.readdirSync(path.join(dir2, "jobs"))) {
    const h = fs.readFileSync(path.join(dir2, "jobs", f), "utf8");
    if (h.includes('http-equiv="refresh"')) continue;
    assert.ok(h.includes(`href="${FEATURE_URL}" target="_blank" rel="noopener noreferrer">${FEATURE_LABEL}</a>`), f);
    assert.doesNotMatch(h, /coming later|may come later/i, f);
  }
});

test("post/pricing/for-employers carry the button and no 'coming later' copy", () => {
  for (const f of ["post.html", "pricing.html", "for-employers.html"]) {
    const h = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(h.includes(`href="${FEATURE_URL}" target="_blank" rel="noopener noreferrer">${FEATURE_LABEL}</a>`), f);
    assert.doesNotMatch(h, /coming later|may come later|come next|featuring TBD/i, f);
  }
});

test("featured fields are validated on inbox records", () => {
  const base = { id: "x", title: "T", company: "C", location: "Austin, TX", type: "Licensed PA", posted: "2026-10-01",
    applyUrl: "https://example.com", sourceUrl: "https://example.com", validThrough: "2026-12-01", description: ["d"] };
  assert.deepEqual(validateRecord({ ...base, featured: true, featured_until: "2026-11-01" }, NOW), []);
  assert.ok(validateRecord({ ...base, featured: "yes" }, NOW).length);
  assert.ok(validateRecord({ ...base, featured: true, featured_until: "11/01/2026" }, NOW).length);
  assert.ok(validateRecord({ ...base, featured: true }, NOW).length);
});
