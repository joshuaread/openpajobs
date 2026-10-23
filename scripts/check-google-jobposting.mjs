#!/usr/bin/env node
// Local validator: check JobPosting JSON-LD on given pages (default: 3 samples) against Google's
// required fields (title, description, datePosted, hiringOrganization.name, jobLocation or
// TELECOMMUTE+applicantLocationRequirements) plus recommended fields we promise.
// Usage: node scripts/check-google-jobposting.mjs [file-or-url ...]
import fs from "node:fs";
const args = process.argv.slice(2);
const targets = args.length ? args : ["jobs/rockwall-licensed-pa-austin-tx.html", "jobs/coastal-ctg.html", "jobs/ifile-claims-public-adjuster-fl-tx-pa.html"];
let fail = 0;
for (const t of targets) {
  const html = /^https?:/.test(t) ? await (await fetch(t)).text() : fs.readFileSync(t, "utf8");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).filter((b) => b["@type"] === "JobPosting");
  if (!blocks.length) { console.log(`FAIL ${t}: no JobPosting`); fail++; continue; }
  for (const b of blocks) {
    const p = [], w = [];
    for (const k of ["title", "description", "datePosted"]) if (!b[k]) p.push(`missing ${k}`);
    if (!b.hiringOrganization?.name) p.push("missing hiringOrganization.name");
    if (isNaN(Date.parse(b.datePosted))) p.push("datePosted not ISO 8601");
    const remote = b.jobLocationType === "TELECOMMUTE";
    const places = [].concat(b.jobLocation || []);
    if (!places.length && !remote) p.push("missing jobLocation");
    for (const pl of places) if (!pl.address?.addressCountry || !(pl.address.addressRegion || pl.address.addressLocality)) p.push("jobLocation address incomplete");
    if (remote && !b.applicantLocationRequirements) p.push("TELECOMMUTE without applicantLocationRequirements");
    if (!b.validThrough) w.push("no validThrough"); else if (Date.parse(b.validThrough) < Date.now()) p.push("validThrough in the past (expired)");
    if (!b.employmentType) w.push("no employmentType");
    if (!b.hiringOrganization?.sameAs) w.push("no hiringOrganization.sameAs");
    if (b.directApply !== false) w.push("directApply not false");
    if (b.baseSalary && !(b.baseSalary.currency && b.baseSalary.value)) p.push("baseSalary malformed");
    console.log(`${p.length ? "FAIL" : "PASS"} ${t}: ${b.title} | ${remote ? "TELECOMMUTE" : "onsite"} | ${b.employmentType} | validThrough=${b.validThrough} | sameAs=${b.hiringOrganization?.sameAs || "-"} | salary=${b.baseSalary ? "yes" : "no"}` +
      (p.length ? `\n     errors: ${p.join("; ")}` : "") + (w.length ? `\n     warnings: ${w.join("; ")}` : ""));
    if (p.length) fail++;
  }
}
process.exit(fail ? 1 : 0);
