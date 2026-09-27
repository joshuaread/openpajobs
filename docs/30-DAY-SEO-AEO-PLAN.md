# Open PA Jobs — 30-Day SEO / AEO Plan (captain view)

**Site:** https://openpajobs.com · **Repo:** joshuaread/openpajobs  
**Full agent build spec:** [`CLAUDE-BUILD-SPEC.md`](./CLAUDE-BUILD-SPEC.md) · **HTML for Josh:** [`30-day-seo-aeo-plan.html`](./30-day-seo-aeo-plan.html)

## Honest baseline (today)

| Fact | Status |
|------|--------|
| Hosting | Static GitHub Pages |
| Jobs | ~8 seed listings in `jobs.json` → `/jobs/{id}.html` |
| Post flow | Web3Forms email only — **not** auto-live |
| SEO foundation | sitemap.xml, robots.txt, hubs, job meta/canonical |
| Gaps | Thin hub copy; no JobPosting JSON-LD; HTTPS cert quirky; no GSC/Bing/analytics wired as of plan write |
| Product priority | Self-serve **post → live** without Josh editing JSON |

Do not invent traffic, rankings, or salary averages.

---

## P0 — Post → live (build first)

**Requirement:** Employer submits `/post` form → within minutes job is on the board + `/jobs/{id}` + Apply works.

**Primary recommendation:** Vercel + Next.js + Supabase `jobs` table; public `POST /api/jobs` with honeypot + rate limit; founding free auto-publish; redirect to live URL. Stripe later for featured.

**Alternative:** GH Pages + serverless commit to `jobs.json` / HTML / sitemap (slower, riskier).

**Acceptance:** UI submit appears on homepage; detail 200; Apply → applyUrl; sitemap includes job; honeypot/empty rejected. Funnel target: **< 2 minutes** form → live.

---

## Week calendar

| Week | Theme | Top outcomes |
|------|-------|--------------|
| **1** | Technical + measurement | HTTPS path clear; GSC + Bing + GA4/Plausible; Organization/WebSite/JobPosting/Breadcrumb JSON-LD; canonical + OG/Twitter; og:image; llms.txt; title/meta consistency; FAQ stub |
| **2** | Deepen money pages | Sourced depth on salaries, become-a-PA, FL/TX/CA location pages, remote, roles; FAQ with AEO answer-first H2s; cite DOI/BLS/industry — **no fake stats** |
| **3** | Inventory + distribution | Post→live hardened; **10–20 real listings**; companies page from live jobs; Josh outreach (FAPIA/NAPIA-adjacent, LinkedIn); hubs → jobs internal links |
| **4** | AEO polish + iteration | Expand FAQ + stats (honest methodology); last-updated dates; sitemap + GSC fixes; measure impressions/queries/AI citations if observable |

---

## Checklist

### Week 1 — Claude / Josh

- [ ] Decide host cutover (Vercel recommended) and HTTPS for openpajobs.com — **Josh + Claude**
- [ ] Google Search Console verified + sitemap submitted — **Josh**
- [ ] Bing Webmaster connected — **Josh**
- [ ] GA4 or Plausible installed — **Josh choose / Claude implement**
- [ ] JobPosting + Organization + WebSite + BreadcrumbList JSON-LD — **Claude**
- [ ] Canonical + OG/Twitter on money pages; default og:image — **Claude**
- [ ] `/llms.txt` — **Claude**
- [ ] FAQ hub stub `/faq.html` (or `/faq`) — **Claude**
- [ ] Title/meta consistency pass — **Claude**

### Week 2 — Claude (Josh reviews citations)

- [ ] `salaries.html` deepened with real sources only
- [ ] `become-a-public-adjuster.html` + state DOI links
- [ ] `locations/fl.html`, `tx.html`, `ca.html` licensing notes + job links
- [ ] `remote.html` + `roles.html` depth
- [ ] FAQ: what is a PA; PA vs independent; how firms hire — answer-first (40–80 words)

### Week 3 — Both

- [ ] Self-serve post → live shipped (see CLAUDE-BUILD-SPEC §A)
- [ ] 10–20 real live jobs (not just seed)
- [ ] Companies page generated from live data
- [ ] Outreach templates sent (Josh voice) — see build spec
- [ ] Internal linking hubs → jobs

### Week 4 — Both

- [ ] FAQ + statistics methodology expanded honestly
- [ ] “Last updated” on guides
- [ ] Sitemap re-submitted; GSC coverage cleaned
- [ ] Optional alerts confirmation SEO
- [ ] KPI snapshot recorded (below)

---

## KPIs (day 30)

| Target | Number |
|--------|--------|
| Indexed URLs | **30+** |
| Live jobs | **10+** |
| Money pages with long-tail GSC presence (e.g. “public adjuster jobs florida”) | **3** |
| Form → live job | **< 2 minutes** |

---

## Who owns what

| Claude builds | Josh owns |
|---------------|-----------|
| Post→live architecture & UI | Domain / DNS / HTTPS decisions |
| DB schema, API, seed import | GSC, Bing, analytics accounts |
| JSON-LD, llms.txt, meta/OG | Soft outreach in his voice |
| Hub content drafts (sourced) | Citation/final copy OK |
| Companies auto page, sitemap | Unpublish / spam calls |
| Copy change: “goes live immediately” | Founding partner conversations |

---

## Out of scope

- Fake salaries, headcounts, social proof  
- Doorway spam state pages  
- Reusing Slatecliff Web3Forms keys  
- Printing the site Web3Forms key from `config.js`

---

## Risks (watch)

| Risk | Mitigation |
|------|------------|
| Spam on open post | Honeypot + rate limit + unpublish stub |
| GH Pages rebuild lag (if alt path) | Prefer Vercel + DB |
| Thin content penalties | Depth on few money pages &gt; many empty states |
| HTTPS / custom domain quirks | Resolve in Week 1 with host cutover |
| Zero listings after launch | Week 3 outreach; keep founding free |

---

*Companion to CLAUDE-BUILD-SPEC.md. Prefer shipping post→live over perfect SEO week one.*
