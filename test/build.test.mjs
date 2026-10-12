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
