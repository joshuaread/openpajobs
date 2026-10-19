# Open PA Jobs

Niche U.S. public adjuster job board — https://openpajobs.com

## Build (Google for Jobs)
No npm deps (Node 20+).

- `node scripts/build.mjs [--now ISO]` — `jobs.json` → `jobs/*.html` (with JobPosting JSON-LD), `jobs.active.json`
  (what the board fetches; expired jobs excluded), `index.html` noscript job links, `sitemap.xml` with lastmod,
  `build-report.json`. Expired jobs (validThrough past; default posted+60d) are dropped and their pages deleted.
- `node scripts/merge-inbox.mjs` — merges `inbox/YYYY-MM-DD.json` into `jobs.json`, moves files to
  `inbox/processed/` (+ `.report.json`), then builds. Never pushes.
- `node scripts/validate.mjs` — checks every generated JSON-LD block.
- `node --test test/`

`jobs.json` optional fields used by the build: `validThrough`, `sourceUrl`, `employmentType`
(FULL_TIME/PART_TIME/CONTRACTOR/TEMPORARY/INTERN/PER_DIEM/OTHER), `addressLocality`, `addressRegion`, `remote`,
`applicantRegions`, `companyUrl`, `updated`, `jsonld:false`.

**Retiring a job:** set its `validThrough` to a past time; the build drops it from the board, feed and sitemap and deletes
its page. If it was replaced by another listing, also set `redirectTo: "<active job id>"`; the build then keeps the old
URL as a noindex meta-refresh stub pointing to the replacement (GitHub Pages has no server-side redirects).

**`scripts/build.mjs` is the generator for job pages, the index fallback list, and sitemap.xml.** The old
`_gen/regen_jobs_ctj.py` is retired and deleted; `_gen/` is local scratch and is not published.

## Daily merge (box cron → PR) and scheduled rebuild
- `.github/workflows/rebuild.yml` runs `node scripts/build.mjs` daily at 11:17 UTC from committed `jobs.json` and
  commits only if output changed (drops expired jobs). It never reads `inbox/`.
- Box cron (documented, not installed yet), 06:23 America/Chicago:
  ```
  23 6 * * * cd /path/to/openpajobs-clone && node scripts/merge-inbox.mjs && node scripts/validate.mjs && node --test test/ && ./scripts/publish-pr.sh >> ~/opj-merge.log 2>&1
  ```
- PR publish step (to be written as `scripts/publish-pr.sh`; needs a fine-grained token scoped to this repo, contents + pull requests):
  ```
  git switch -c inbox/$(date +%F) && git add jobs.json jobs.active.json jobs index.html sitemap.xml data build-report.json
  git commit -m "jobs: inbox merge $(date +%F)" && git push -u origin HEAD && gh pr create --fill --base main
  ```
  `inbox/` stays on the box (gitignored).

## SEO scripts (Week 1 pass) — interaction with the build
- `scripts/seo_pass.py` is a one-time, manual script. **Do not re-run it.** It rewrites the
  `<!-- BEGIN JOBPOSTING JSON-LD -->` block with its own older JSON-LD: hard-coded employmentType, no validThrough, and it
  would re-add markup to aaa-pa and statewide-pa. `scripts/build.mjs` now produces the canonical, og:*, twitter:* and Plausible tags for job pages itself.
- `.github/workflows/seo-apply-once.yml` runs only by manual dispatch and only on the branch `seo/week1-technical-pass`.
  It never runs on push to main and doesn't touch files that build.mjs or rebuild.yml write.
