# Google for Jobs — validation & test plan

## Local (every build, automated)
1. `npm test` (`node --test test/`) — JSON-LD fields, `</script>` escaping, expiry drop, determinism, merge dedupe/rejects.
2. `npm run validate` — parses every `<script type="application/ld+json">` in `jobs/*.html`, checks title,
   description, datePosted, validThrough (ISO datetime, not past), hiringOrganization.name,
   jobLocation (PostalAddress, addressCountry US) or TELECOMMUTE + applicantLocationRequirements,
   employmentType enum, directApply=false. Non-zero exit on failure.
3. `build-report.json` — review `jsonLdSkipped`, `missingFields`, `defaultedValidThrough`, `droppedExpired`.

## After deploy (manual; cannot run from the box)
Sample URLs (one per shape):
- Onsite city/state: https://openpajobs.com/jobs/rockwall-austin.html
- Remote: https://openpajobs.com/jobs/coastal-ctg.html
- Multi-state + salary: https://openpajobs.com/jobs/metro-apprentice.html
  (also spot check hybrid metro-claims-rep.html: jobLocation Philadelphia + TELECOMMUTE)

1. **Rich Results Test** (https://search.google.com/test/rich-results) on each URL:
   - "Job posting" detected, 0 errors. Warnings acceptable only for recommended fields we lack
     (e.g. baseSalary on aaa-pa, streetAddress/postalCode on onsite jobs).
   - Remote: confirm jobLocationType TELECOMMUTE and applicantLocationRequirements Country=US is read.
   - Onsite: addressLocality/addressRegion/addressCountry parsed; multi-state shows 5 locations.
   - Use "View tested page → HTML" to confirm JSON-LD is in the served HTML (not JS-injected).
2. **Search Console → URL Inspection** on the same 3 URLs → "Test live URL" → Job posting enhancement
   detected, valid. Then "Request indexing".
3. **Sitemaps**: submit https://openpajobs.com/sitemap.xml; confirm read OK, discovered URLs = sitemapUrls in build-report,
   lastmod present. Removed/expired job URLs must 404 (GitHub Pages does this once the file is gone).
4. **Enhancements → Job postings report**: watch 3–14 days for valid/invalid counts; fix any "Missing field" issues.
5. **Visible-content check**: title, company, location, salary, description on page match JSON-LD (they come from the same record).
6. **Expiry check**: after the first listing passes validThrough, rebuild, confirm page 404s, URL gone from sitemap,
   then optionally use the Indexing API / URL Inspection to request recrawl.
7. Optional: Schema.org validator (https://validator.schema.org/) for non-Google schema errors.
