# Open PA Jobs — Claude Build Spec (agent handoff)

**Site:** https://openpajobs.com  
**Repo:** joshuaread/openpajobs  
**Local path:** `/workspace/openpajobs/`  
**Admin contact:** joshua.gray.read@gmail.com  
**Audience for this doc:** Claude (implementer). Josh reviews HTML; Claude builds from this Markdown.

**Current stack (do not invent otherwise):** Static GitHub Pages. Jobs live in `jobs.json`; cards link to `/jobs/{id}.html`; Apply goes external via `applyUrl`. `post.html` today only emails Josh via Web3Forms (“Request founding post”) — listings do **not** go live automatically. SEO foundation exists (sitemap, robots, hubs, CTJ-style footer, job detail meta). Thin content; no JobPosting JSON-LD; HTTPS custom-domain cert still quirky; ~8 seed jobs. Dedicated Web3Forms key in `config.js` — **never print or commit that key into docs/logs**.

**Product goal (non-negotiable):** Employers fill a form and within minutes the job appears on the board, has a `/jobs/{id}` page, and Apply works — without Josh hand-editing JSON.

---

## A) Post-a-job → live (P0 — build first)

### Product requirement

1. Employer opens `/post.html` (or an improved Next.js `/post` flow).
2. Submits a valid job (title, company, location, apply URL, etc.).
3. Within ~2 minutes the job is:
   - Visible on the homepage board list
   - Reachable at `/jobs/{id}` (or Next route equivalent) with 200 + real content
   - Apply button hits the employer’s `applyUrl`
   - Included in sitemap (or dynamic sitemap equivalent)
4. No Josh JSON edits. No “we’ll review and email you” as the only path.
5. Founding window: **auto-publish free** with light spam checks. Admin unpublish later is fine as a stub.

### Primary architecture (recommended — pragmatic)

**Move hosting to Vercel (or similar) with Next.js + Supabase.**

| Layer | Choice | Notes |
|-------|--------|--------|
| Host | Vercel | Custom domain `openpajobs.com`; fix HTTPS while migrating |
| App | Next.js (App Router) | Keep static marketing hubs as pages; SSR/ISR job pages for SEO |
| Data | Supabase Postgres `jobs` table | Source of truth; replace hand-edited `jobs.json` |
| Write path | `POST /api/jobs` (or server action) | Public create with honeypot + rate limit + optional email verify |
| Read path | Board + job pages query DB | Homepage list from published jobs; detail via slug/`id` |
| Payments | Stripe later | Founding free now; featured/paid later — do not block P0 |
| Success UX | Redirect to live job URL | “Your job is live” + shareable link |

**Suggested `jobs` table (minimum):**

```text
id            text PK          -- slug, e.g. metro-apprentice
title         text not null
company       text not null
location      text not null
type          text             -- category label: Licensed PA, Apprentice, etc.
tags          text[]           -- default '{}'
blurb         text not null    -- short card text
description   text not null    -- long text or markdown
apply_url     text             -- required unless email_apply set
email_apply   text             -- optional mailto path; if set, apply_url may be omitted
employment_type text           -- FULL_TIME | PART_TIME | CONTRACT | TEMPORARY | OTHER
remote        boolean default false
poster_email  text not null
featured      boolean default false
published     boolean default true
posted_at     timestamptz default now()
updated_at    timestamptz default now()
source        text default 'self-serve'  -- seed | self-serve | admin
```

**Slug / id rules:**

- Derive from `title` + `company`: lowercase, ASCII, hyphens, strip punctuation.
- Max ~60 chars; append short suffix (`-a1b2`) on collision.
- Immutable after publish (URL stability for SEO).
- Reject reserved ids: `post`, `index`, `admin`, `api`, etc.

**`POST /api/jobs` contract (sketch):**

Request JSON (or form-encoded → same fields):

- Required: `title`, `company`, `location`, `blurb`, `description`, `poster_email`, and (`apply_url` **or** `email_apply`)
- Optional: `type`, `tags[]`, `employment_type`, `remote`, honeypot field `_hp` (must be empty)
- Server sets: `id`, `posted_at`, `published=true` (founding), `featured=false`

Response `201`:

```json
{ "ok": true, "id": "acme-licensed-pa-houston", "url": "/jobs/acme-licensed-pa-houston" }
```

Then client redirects to that URL (or a thin success page that links there).

**Validation:**

- `title` 5–120 chars; `company` 2–80; `location` 2–80
- `blurb` 20–400; `description` 80–20000
- `apply_url` must be `https://` (prefer); reject `javascript:`, relative spam, obvious shorteners if desired
- `poster_email` valid email; store for admin contact only (not shown publicly by default)
- `tags`: max 8; each 2–32 chars; allowlist-ish (alphanumeric + hyphen) or sanitize
- Reject if honeypot filled; reject if body looks empty / all whitespace
- Rate limit: e.g. 5 posts / IP / hour; 3 / email / day (Upstash Redis or Vercel KV is fine)

**Spam / light checks (founding auto-live):**

- Honeypot + rate limit (hard reject)
- Blocklist obvious spam phrases / URL hosts (extend over time)
- Optional: send confirmation email with “edit/unpublish” magic link later — **not required for P0**
- Do **not** require Josh approval for founding free posts

**Moderation stub:**

- Admin route or Supabase row flag `published=false` — Josh can unpublish via dashboard or SQL
- Contact: joshua.gray.read@gmail.com
- Full admin UI can be Week 3+; stub is OK for P0

**Copy updates (must ship with P0):**

- `post.html` / `/post`: change from “Request founding post” / “We’ll review and publish” → **“Post a job — goes live immediately (founding free)”**
- `pricing.html`: founding free, live on submit; paid featuring TBD
- Homepage / for-employers: align language (no email-only promise)

**Seed migration:**

- Import existing `jobs.json` (~8 jobs) into Supabase via a one-shot script (`scripts/import-jobs-json.ts`)
- Keep script in repo for re-runs; mark `source='seed'`
- Remove or stop relying on static `jobs.json` as runtime source after cutover
- Preserve existing `/jobs/{id}` URLs for the 8 seed ids

**Alerts:** Keep Web3Forms for alerts for now **or** move to Supabase later. Do not reuse any Slatecliff Web3Forms key. Never print the Open PA Jobs key from `config.js`.

### Alternative architecture (if Claude prefers minimal migration)

**Stay on GitHub Pages:** Form → serverless function (Vercel/Netlify/Cloudflare Worker) → GitHub App/token commits `jobs.json` + generates `jobs/{id}.html` + updates `sitemap.xml` → Pages rebuild.

- Pros: less stack change  
- Cons: slower (rebuild lag), noisier git history, token risk, harder rate limits  
- Acceptable if Claude documents tradeoffs and still meets acceptance tests (< few minutes to live)

**Primary remains Next.js + Supabase.** Document which path you chose at the top of the PR.

### Success / failure UX

**Success:**

- Message: “Your job is live”
- Primary CTA: link to `/jobs/{id}`
- Secondary: “Post another” / “Back to board”
- Optional: email Josh a notification (Web3Forms or Resend) — notify only, not gating publish

**Failure:**

- Inline field errors for validation
- Generic “Couldn’t publish — try again” for server/rate-limit (don’t leak internals)
- Honeypot: silent fail or generic reject (no helpful bot tips)

### Acceptance tests Claude must pass

1. Submit a test job via the UI → it appears on the homepage list without manual JSON edits  
2. Job detail URL returns **200** with title/company/description content  
3. Apply button navigates to the submitted `applyUrl`  
4. Sitemap (or `/sitemap.xml` dynamic) includes the new job URL  
5. Empty required fields and filled honeypot are rejected (no publish)

Manual QA notes: use a throwaway apply URL; unpublish or delete test jobs after.

---

## B) 30-day SEO / AEO plan (weeks 1–4)

Owners implied: **Claude** = build/content code; **Josh** = accounts, outreach voice, final publish calls.

### Week 1 — Technical + measurement

| Task | Owner | Notes |
|------|-------|--------|
| Enforce HTTPS when cert ready | Josh + Claude | Custom domain cert still quirky; fix with Vercel cutover if migrating |
| Google Search Console property | Josh | Verify domain; submit sitemap |
| Bing Webmaster | Josh | Import from GSC or verify |
| GA4 **or** Plausible | Josh choose; Claude install | Prefer privacy-friendly if Josh wants Plausible |
| Organization + WebSite JSON-LD on home | Claude | |
| JobPosting JSON-LD on every job page | Claude | Map title, company, location, datePosted, employmentType, url, description |
| BreadcrumbList on job + hub pages | Claude | |
| Canonical + OG/Twitter on all money pages | Claude | Home, post, pricing, salaries, become-a-PA, locations, remote, roles, FAQ |
| `og:image` brand card | Claude | Simple branded PNG/SVG card; one default OK |
| `llms.txt` at site root | Claude | Short site purpose + key URLs for AEO |
| Optional `/faq.html` hub | Claude | Stub OK in W1; deepen W2/W4 |
| Fix thin/inconsistent title + meta | Claude | Pattern: `{Topic} — Open PA Jobs` |

### Week 2 — Deepen money pages (sourced, no fake stats)

Prioritize **content depth** with real citations (DOI / BLS / industry). Question-led H2s; **40–80 word direct answer first**, then detail (AEO).

1. **`salaries.html`** — Structure of PA pay (commission / salary / hybrid); cite BLS or industry sources where real; no invented averages  
2. **`become-a-public-adjuster.html`** — License path overview + links to state DOI pages  
3. **`locations/fl.html`, `tx.html`, `ca.html`** — Real licensing notes + internal links to live jobs (filter by state if API supports)  
4. **`remote.html`, `roles.html`** — Deepen; link to live filtered lists  
5. **FAQ page** — At minimum: “What is a public adjuster?”, “PA vs independent adjuster”, “How do PA firms hire?”

### Week 3 — Inventory + distribution

- **Ship / harden post→live** from section A; recruit **10–20 real listings** (Josh outreach + Claude polish onboarding)  
- **Companies page** auto-built from live jobs (distinct `company` values)  
- Soft outreach (Josh voice) — templates below  
- Internal linking pass: hubs → jobs; jobs → related hubs  

**Outreach draft templates (Josh voice — edit before send):**

*LinkedIn / FAPIA–NAPIA adjacent groups (short):*

> Quick note — I put up Open PA Jobs (openpajobs.com), a small board just for public adjuster roles (licensed desks, apprentices, CTG, firm ops). Founding posts are free and go live on submit. If your firm is hiring, I’d love a listing: https://openpajobs.com/post.html — and if you’re job-hunting, the board is live. Not affiliated with FAPIA/NAPIA; just trying to make PA hiring less scattered.

*Email to a firm:*

> Subject: Free founding listing on Open PA Jobs  
>  
> Hi {Name} — I’m Josh. Open PA Jobs is a niche board for public adjuster roles. During founding, posts are free and publish immediately: {title / location / apply link}. Happy to feature {Firm} if helpful. Link: https://openpajobs.com/post.html — questions → joshua.gray.read@gmail.com

### Week 4 — AEO polish + iteration

- Expand FAQ + `statistics.html` with **honest methodology** (what you measured, what you didn’t)  
- Add “Last updated” dates on guides  
- Re-submit sitemap; fix GSC coverage / soft-404 / duplicate issues  
- Optional: job alerts confirmation page with sensible meta  
- Measure: impressions, queries, which pages get AI citations if observable  

### KPI targets (realistic for a new niche board)

| KPI | Day-30 target |
|-----|----------------|
| Indexed URLs | 30+ |
| Live jobs | 10+ |
| Money pages ranking for long-tail (e.g. “public adjuster jobs florida”) | 3 pages showing in impressions/rankings |
| Posting funnel | Form complete → live job **< 2 minutes** |

No fake traffic claims. Report honestly from GSC/analytics.

---

## C) Out of scope / do not

- Fake salary averages, headcounts, or “X firms hire here” social proof  
- Fake testimonials or invented partner logos  
- Spray SEO doorway pages for every US state with thin duplicate content  
- Reuse any Slatecliff Web3Forms key  
- Print or paste the Web3Forms access key from `config.js` into docs, commits messages, or logs  
- Promise carrier/NAPIA/FAPIA affiliation  

---

## D) Repo conventions Claude should keep

- **Design system:** `styles.css`, `board.css` / `board-a.css` / `board-b.css`, `polish.css`, `job.css` — **extend, don’t redesign** unless Next migration requires component ports  
- **Theme toggle:** existing sun/moon SVG + `data-theme` + `localStorage` key `openpajobs-theme`  
- **Footer:** CTJ-style link density (seekers / employers / company columns + quick links)  
- **Typography:** Inter + system fallbacks already in use  
- **Accent:** blue (`#2563eb` / existing `--` tokens — match site, don’t invent a new brand)  
- **Admin contact:** joshua.gray.read@gmail.com  
- **Jobs shape today:** see `jobs.json` — `id`, `title`, `company`, `location`, `type`, `tags`, `blurb`, `applyUrl`, `description[]`, optional `featured` / `posted`  
- Prefer keeping URL paths stable (`/post.html` can redirect to `/post` if App Router)  

### Suggested PR / delivery order

1. Scaffold Next + Supabase + import seed jobs  
2. `POST /api/jobs` + post UI + redirect success  
3. Board + job pages from DB + JobPosting JSON-LD  
4. Update pricing/post copy; sitemap; acceptance tests  
5. Week 1 SEO tech checklist in parallel where possible  

### Companion docs

- Human-readable plan: [`docs/30-DAY-SEO-AEO-PLAN.md`](./30-DAY-SEO-AEO-PLAN.md)  
- Josh HTML review: [`docs/30-day-seo-aeo-plan.html`](./30-day-seo-aeo-plan.html)  

---

*Spec written for Open PA Jobs founding phase. Prefer shipping self-serve post→live over perfect architecture.*
