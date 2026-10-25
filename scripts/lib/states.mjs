// State landing pages: /jobs/<state-slug>/index.html (+ /jobs/remote/) generated from active jobs.
import fs from "node:fs";
import path from "node:path";
import { SITE, GA_SNIPPET, CACHE, JS_VERSION, esc, parseLocation, STATES } from "./jobs.mjs";
import { STATE_SLUG_TO_SLOT, marker } from "./sponsors.mjs";
import { ICON, THEME_BOOT, NAV, FOOTER } from "./templates.mjs";

export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** [{slug, name, abbr|null, jobs[]}] sorted by name; remote last. Skips the founding placeholder. */
export function groupByState(active) {
  const by = new Map();
  const add = (key, name, abbr, j) => {
    if (!by.has(key)) by.set(key, { slug: slugify(name), name, abbr, jobs: [] });
    const g = by.get(key);
    if (!g.jobs.includes(j)) g.jobs.push(j);
  };
  for (const j of active) {
    if (j.id === "founding-placeholder") continue;
    const loc = parseLocation(j);
    for (const p of loc.places) if (STATES[p.region]) add(p.region, STATES[p.region], p.region, j);
    for (const r of loc.applicantRegions) if (STATES[r]) add(r, STATES[r], r, j);
    if (loc.remote) add("REMOTE", "Remote", null, j);
  }
  const groups = [...by.values()];
  for (const g of groups) g.jobs.sort((a, b) => (b.posted || "").localeCompare(a.posted || "") || a.id.localeCompare(b.id));
  return groups.sort((a, b) => (a.abbr === null) - (b.abbr === null) || a.name.localeCompare(b.name));
}

const label = (g) => (g.abbr ? g.name : "Remote");
export function statesLinksHtml(groups, cls = "") {
  return `<ul class="state-links${cls ? " " + cls : ""}">` +
    groups.map((g) => `<li><a href="/jobs/${g.slug}/">${esc(label(g))} public adjuster jobs</a> <span class="fine">(${g.jobs.length})</span></li>`).join("") + "</ul>";
}

export function renderStatePage(g, groups) {
  const url = `${SITE}/jobs/${g.slug}/`;
  const n = g.jobs.length;
  const where = g.abbr ? `in ${g.name}` : "you can work remotely";
  const title = g.abbr ? `Public Adjuster Jobs in ${g.name} (${g.abbr}) — Open PA Jobs` : "Remote Public Adjuster Jobs — Open PA Jobs";
  const h1 = g.abbr ? `Public adjuster jobs in ${g.name}` : "Remote public adjuster jobs";
  const desc = g.abbr
    ? `${n} open public adjuster role${n === 1 ? "" : "s"} in ${g.name}: licensed PA, apprentice, claims rep, and estimator jobs at PA firms. Updated daily.`
    : `${n} remote and work-from-home public adjuster role${n === 1 ? "" : "s"}: desk adjusters, claims reps, and estimators at PA firms. Updated daily.`;
  const firms = [...new Set(g.jobs.map((j) => j.company))];
  const intro = g.abbr
    ? `Open PA Jobs lists ${n} current public adjuster opening${n === 1 ? "" : "s"} ${where} from ${firms.length} firm${firms.length === 1 ? "" : "s"}, including ${esc(firms.slice(0, 3).join(", "))}. Public adjusters represent policyholders, not carriers; most ${esc(g.name)} roles need a state PA license, and apprentice and claims-rep roles are a common way in. Every listing links to the employer's own application, and expired posts are removed automatically.`
    : `These ${n} public adjuster opening${n === 1 ? "" : "s"} allow remote or work-from-home arrangements, usually desk adjusting, estimating, or claims support. Some still require a license or occasional field inspections in specific states, so check each listing. Every listing links to the employer's own application, and expired posts are removed automatically.`;
  const list = g.jobs.map((j) =>
    `<li><a href="/jobs/${esc(j.id)}.html"><strong>${esc(j.title)}</strong></a><span class="job-more-meta">${esc(j.company)} · ${esc(j.location)} · posted ${esc(j.posted)}</span></li>`).join("");
  const others = groups.filter((o) => o !== g);
  const css = ["styles", "board", "polish", "job"].map((c) => `<link rel="stylesheet" href="/${c}.css?v=${CACHE}" />`).join("");
  const og =
    `<meta property="og:type" content="website" /><meta property="og:site_name" content="Open PA Jobs" />` +
    `<meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" />` +
    `<meta property="og:url" content="${url}" /><meta property="og:image" content="${SITE}/og-image.png" />` +
    `<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />` +
    `<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(title)}" />` +
    `<meta name="twitter:description" content="${esc(desc)}" /><meta name="twitter:image" content="${SITE}/og-image.png" />`;
  const crumbs = { "@context": "https://schema.org/", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Jobs", item: `${SITE}/` },
    { "@type": "ListItem", position: 2, name: h1, item: url }] };
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${GA_SNIPPET}` +
    `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><link rel="canonical" href="${url}" />` +
    `<link rel="icon" href="${ICON}" /><script>\n${THEME_BOOT}\n</script>` +
    `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet" />` +
    `${css}${og}<script type="application/ld+json">${JSON.stringify(crumbs).replace(/</g, "\\u003c")}</script></head><body>${NAV}<main>` +
    `<section class="job-page"><div class="wrap job-page-inner"><nav class="job-breadcrumb" aria-label="Breadcrumb"><a href="/#jobs">Jobs</a><span aria-hidden="true">/</span><span>${esc(label(g))}</span></nav>` +
    `<h1>${esc(h1)}</h1><p class="lede">${intro}</p>${STATE_SLUG_TO_SLOT[g.slug] ? marker(`page-${STATE_SLUG_TO_SLOT[g.slug]}`) : ""}` +
    `<h2>${n} open role${n === 1 ? "" : "s"}</h2><ul class="job-more-list">${list}</ul>` +
    `<h2>Other locations</h2>${statesLinksHtml(others)}<p class="fine"><a href="/#jobs">← All public adjuster jobs</a></p></div></section></main>` +
    `${FOOTER}<script src="/config.js?v=${CACHE}"></script><script src="/main.js?v=${JS_VERSION}"></script></body></html>\n`;
}

/** Write state pages, delete stale ones. Returns [{slug, name, count, rel}] */
export function writeStatePages(root, active, post = (h) => h) {
  const groups = groupByState(active);
  const jobsDir = path.join(root, "jobs");
  const want = new Set(groups.map((g) => g.slug));
  for (const d of fs.readdirSync(jobsDir, { withFileTypes: true })) {
    if (d.isDirectory() && !want.has(d.name) && fs.existsSync(path.join(jobsDir, d.name, ".state-page")))
      fs.rmSync(path.join(jobsDir, d.name), { recursive: true });
  }
  for (const g of groups) {
    const dir = path.join(jobsDir, g.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".state-page"), "generated by scripts/lib/states.mjs\n");
    fs.writeFileSync(path.join(dir, "index.html"), post(renderStatePage(g, groups)));
  }
  return groups;
}

/** Replace <!--STATES:START-->…<!--STATES:END--> blocks (footer + home) in a page. */
export function injectStateLinks(html, groups) {
  const foot = `<!--STATES:START--><nav class="footer-quick footer-states" aria-label="Jobs by state">` +
    groups.map((g) => `<a href="/jobs/${g.slug}/">${esc(label(g))}</a>`).join("") + `</nav><!--STATES:END-->`;
  let out = html.replace(/<!--STATES:START-->[\s\S]*?<!--STATES:END-->/g, foot);
  out = out.replace(/<!--HOMESTATES:START-->[\s\S]*?<!--HOMESTATES:END-->/,
    `<!--HOMESTATES:START--><section class="section section-states" aria-label="Jobs by state"><div class="wrap"><h2>Browse public adjuster jobs by state</h2>${statesLinksHtml(groups)}</div></section><!--HOMESTATES:END-->`);
  return out;
}
