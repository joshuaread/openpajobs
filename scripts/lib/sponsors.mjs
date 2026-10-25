// Sponsor slots (data-driven from sponsors.json). Unsold slots link to /sponsor.html.
// Markers in pages: <!--SPONSOR:<id>:START-->…<!--SPONSOR:<id>:END-->
//   site-home            homepage line (index.html)
//   site-footer          every page's footer (inserted automatically before .footer-bottom if missing)
//   page-<key>           page sponsor box; key is one of PAGE_SLOTS
// Start/end are also checked in the browser by main.js, so a slot flips on/off on the right day even on
// pages the daily rebuild doesn't commit.
import fs from "node:fs";
import path from "node:path";
import { esc } from "./jobs.mjs";

export const SITE_PRICE = 99;
export const PAGE_PRICE = 49;
export const CONTACT_EMAIL = "hello@openpajobs.com";
export const CONTACT_SUBJECT = "Sponsor Open PA Jobs";
export const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(CONTACT_SUBJECT)}`;

/** key -> where the page-sponsor box shows (static page and/or generated /jobs/<slug>/ page). */
export const PAGE_SLOTS = {
  "become-a-public-adjuster": { label: "Become a Public Adjuster guide", pages: ["become-a-public-adjuster.html"] },
  remote: { label: "Remote jobs", pages: ["remote.html", "jobs/remote/index.html"], stateSlug: "remote" },
  florida: { label: "Florida jobs", pages: ["locations/fl.html", "jobs/florida/index.html"], stateSlug: "florida" },
  texas: { label: "Texas jobs", pages: ["locations/tx.html", "jobs/texas/index.html"], stateSlug: "texas" },
};
export const STATE_SLUG_TO_SLOT = Object.fromEntries(
  Object.entries(PAGE_SLOTS).filter(([, v]) => v.stateSlug).map(([k, v]) => [v.stateSlug, k]));

export const marker = (id) => `<!--SPONSOR:${id}:START--><!--SPONSOR:${id}:END-->`;

export function loadSponsors(root) {
  const fp = path.join(root, "sponsors.json");
  const raw = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, "utf8")) : {};
  const pages = {};
  for (const k of Object.keys(PAGE_SLOTS)) pages[k] = raw.pages?.[k] ?? null;
  return { site: raw.site ?? null, pages };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Problems with a filled-in sponsor entry ([] when null or OK). */
export function sponsorProblems(sp) {
  if (!sp) return [];
  const p = [];
  if (!sp.name || typeof sp.name !== "string") p.push("name missing");
  if (!/^https:\/\//.test(sp.url || "")) p.push("url must start with https://");
  if (sp.logo && !/^(https:\/\/|\/)/.test(sp.logo)) p.push("logo must be https:// or a /path");
  if (!DATE.test(sp.start || "")) p.push("start must be YYYY-MM-DD");
  if (sp.end != null && sp.end !== "" && !DATE.test(sp.end)) p.push("end must be YYYY-MM-DD or null");
  return p;
}
/** start (00:00 UTC) <= now <= end (23:59:59 UTC); no end = open-ended. Invalid entries fail closed. */
export function isSponsorLive(sp, now) {
  if (!sp || sponsorProblems(sp).length) return false;
  const t = now.getTime();
  if (t < Date.parse(`${sp.start}T00:00:00Z`)) return false;
  if (sp.end && t > Date.parse(`${sp.end}T23:59:59Z`)) return false;
  return true;
}

function slotHtml({ slot, kind, sp, now, openText }) {
  const live = isSponsorLive(sp, now);
  const showSponsor = sp && !sponsorProblems(sp).length && (live || (sp.end ? now.getTime() <= Date.parse(`${sp.end}T23:59:59Z`) : true));
  const label = kind === "page" ? "This page is sponsored by" : "Sponsored by";
  const open = `<a class="sponsor-open" href="/sponsor.html"${live ? " hidden" : ""}>${esc(openText)}</a>`;
  let inner = `<span class="sponsor-label">${label}</span>`;
  let attrs = ` class="sponsor-slot sponsor-slot--${kind}" data-sponsor-slot="${esc(slot)}"`;
  if (showSponsor) {
    attrs += ` data-sponsor-start="${esc(sp.start)}"` + (sp.end ? ` data-sponsor-end="${esc(sp.end)}"` : "");
    const logo = sp.logo ? `<img class="sponsor-logo" src="${esc(sp.logo)}" alt="" loading="lazy" decoding="async" />` : "";
    const tag = sp.tagline ? ` <span class="sponsor-tagline">${esc(sp.tagline)}</span>` : "";
    inner += `<span class="sponsor-body"${live ? "" : " hidden"}><a class="sponsor-link" href="${esc(sp.url)}" rel="sponsored noopener" target="_blank" data-sponsor="${esc(sp.name)}">${logo}<span class="sponsor-name">${esc(sp.name)}</span></a>${tag}</span>`;
  }
  inner += open;
  return `<aside${attrs} aria-label="Sponsor">${inner}</aside>`;
}

export function renderSlot(id, sponsors, now) {
  if (id === "site-home" || id === "site-footer")
    return slotHtml({ slot: id === "site-home" ? "site_home" : "site_footer", kind: id === "site-home" ? "home" : "footer",
      sp: sponsors.site, now, openText: `Your company here: founding sponsor spot, $${SITE_PRICE}/mo` });
  const key = id.replace(/^page-/, "");
  if (!(key in PAGE_SLOTS)) return "";
  return slotHtml({ slot: `page_${key}`, kind: "page", sp: sponsors.pages[key], now,
    openText: `Your company here: founding sponsor spot, $${PAGE_PRICE}/mo` });
}

/** Fill every sponsor marker; add the footer marker before .footer-bottom when a page lacks it. */
export function injectSponsors(html, sponsors, now) {
  let out = html;
  if (out.includes('<div class="footer-bottom">') && !out.includes("<!--SPONSOR:site-footer:START-->"))
    out = out.replace('<div class="footer-bottom">', `${marker("site-footer")}<div class="footer-bottom">`);
  return out.replace(/<!--SPONSOR:([a-z0-9-]+):START-->[\s\S]*?<!--SPONSOR:\1:END-->/g,
    (_, id) => `<!--SPONSOR:${id}:START-->${renderSlot(id, sponsors, now)}<!--SPONSOR:${id}:END-->`);
}

/** Live numbers for sponsor.html, from the active listings only. */
export function sponsorStats(active, stateGroups) {
  const count = (slug) => stateGroups.find((g) => g.slug === slug)?.jobs.length ?? 0;
  return {
    listings: active.length,
    firms: new Set(active.map((j) => (j.company || "").trim().toLowerCase()).filter(Boolean)).size,
    remote: count("remote"), florida: count("florida"), texas: count("texas"),
  };
}

/** Fill <!--STAT:name-->…<!--/STAT--> and the slot-status table on sponsor.html. */
export function injectSponsorPage(html, stats, sponsors, now, today) {
  let out = html.replace(/<!--STAT:([a-z]+)-->[\s\S]*?<!--\/STAT-->/g,
    (m, k) => (k === "date" ? `<!--STAT:date-->${today}<!--/STAT-->` : k in stats ? `<!--STAT:${k}-->${stats[k]}<!--/STAT-->` : m));
  const st = (sp) => (isSponsorLive(sp, now) ? `Taken (${esc(sp.name)})` : "Open");
  const rows = [[`Founding site sponsor: homepage and every page's footer`, `$${SITE_PRICE}/mo`, st(sponsors.site)],
    ...Object.entries(PAGE_SLOTS).map(([k, v]) => {
      const n = v.stateSlug ? ` (${stats[v.stateSlug]} live listings)` : "";
      return [`Page sponsor: ${v.label}${n}`, `$${PAGE_PRICE}/mo`, st(sponsors.pages[k])];
    })];
  const table = `<table class="sponsor-table"><thead><tr><th scope="col">Slot</th><th scope="col">Price</th><th scope="col">Status</th></tr></thead><tbody>` +
    rows.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`).join("") + `</tbody></table>`;
  return out.replace(/<!--SLOTS:START-->[\s\S]*?<!--SLOTS:END-->/, `<!--SLOTS:START-->${table}<!--SLOTS:END-->`);
}
