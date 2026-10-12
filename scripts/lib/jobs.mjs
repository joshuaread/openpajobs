// Shared job logic: validation, location parsing, JobPosting JSON-LD, page rendering.
// Ported from _gen/regen_jobs_ctj.py (markup kept byte-identical); JSON-LD rebuilt for Google for Jobs.
import { ICON, THEME_BOOT, NAV, FOOTER, SVG_PIN, SVG_USER, SVG_DOLLAR } from "./templates.mjs";

export const SITE = "https://openpajobs.com";
export const CACHE = "20260927a";
export const DEFAULT_VALID_DAYS = 60;

// ---------- helpers ----------
// Same as Python html.escape(s, quote=True)
export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// JSON safe to embed inside <script>: no "</script>", "<!--", or U+2028/2029 can break out.
export function safeJson(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function isValidDate(s) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
export function isValidDateOrDateTime(s) {
  if (typeof s !== "string") return false;
  if (DATE_RE.test(s)) return isValidDate(s);
  return DATETIME_RE.test(s) && !isNaN(new Date(s)) && isValidDate(s.slice(0, 10));
}
// Date-only validThrough means "through the end of that day" (UTC).
export function toIsoDateTime(s) {
  if (DATE_RE.test(s)) return `${s}T23:59:59Z`;
  return s;
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Resolve validThrough; returns { value (ISO datetime), defaulted } or null if impossible. */
export function resolveValidThrough(job) {
  if (job.validThrough && isValidDateOrDateTime(job.validThrough)) {
    return { value: toIsoDateTime(job.validThrough), defaulted: false };
  }
  if (isValidDate(job.posted)) {
    return { value: toIsoDateTime(addDays(job.posted, DEFAULT_VALID_DAYS)), defaulted: true };
  }
  return null;
}
export function isExpired(job, now) {
  const vt = resolveValidThrough(job);
  if (!vt) return false; // can't tell; kept, but reported as missing field
  return new Date(vt.value).getTime() < now.getTime();
}

// ---------- locations ----------
const STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const NAME_TO_ABBR = Object.fromEntries(Object.entries(STATES).map(([a, n]) => [n.toLowerCase(), a]));
// Metro names that unambiguously imply a city/state. Documented in SHIP-BRIEF; extend deliberately.
const METROS = { "greater philadelphia": ["Philadelphia", "PA"] };

/**
 * Structured fields on the record win (addressLocality, addressRegion, remote, applicantRegions).
 * Otherwise parse the free-text `location`. Returns
 * { remote, places:[{locality?, region}], applicantRegions:[abbr], ok }.
 */
export function parseLocation(job) {
  const raw = String(job.location || "");
  const low = raw.toLowerCase();
  const tags = (job.tags || []).map((t) => String(t).toLowerCase());
  const remote =
    typeof job.remote === "boolean" ? job.remote : /\bremote\b/.test(low) || tags.includes("remote");
  const places = [];
  if (job.addressRegion) {
    places.push({ locality: job.addressLocality || undefined, region: String(job.addressRegion).toUpperCase() });
  } else {
    for (const [metro, [city, st]] of Object.entries(METROS)) {
      if (low.includes(metro)) places.push({ locality: city, region: st });
    }
    // "City, ST"
    const m = raw.match(/([A-Za-z .'-]+),\s*([A-Z]{2})\b/);
    if (!places.length && m && STATES[m[2]]) places.push({ locality: m[1].trim(), region: m[2] });
    if (!places.length) {
      // List of state abbreviations or full names: "PA / NJ / WV", "Florida"
      const parts = raw.split(/[\/,&]|\band\b/i).map((p) => p.trim()).filter(Boolean);
      const regs = [];
      let allStates = parts.length > 0;
      for (const p of parts) {
        if (STATES[p]) regs.push(p);
        else if (NAME_TO_ABBR[p.toLowerCase()]) regs.push(NAME_TO_ABBR[p.toLowerCase()]);
        else allStates = false;
      }
      if (allStates) for (const r of regs) places.push({ region: r });
    }
  }
  const applicantRegions = Array.isArray(job.applicantRegions) ? job.applicantRegions : [];
  return { remote, places, applicantRegions, ok: remote || places.length > 0 };
}

// ---------- employment type ----------
const EMP_ENUM = ["FULL_TIME", "PART_TIME", "CONTRACTOR", "TEMPORARY", "INTERN", "VOLUNTEER", "PER_DIEM", "OTHER"];
export { EMP_ENUM };
/** Data-driven only: explicit employmentType field > type/tags keywords > OTHER (never guessed). */
export function employmentType(job) {
  if (job.employmentType) {
    const v = [].concat(job.employmentType).map((s) => String(s).toUpperCase().replace(/[- ]/g, "_"));
    const ok = v.filter((x) => EMP_ENUM.includes(x));
    if (ok.length) return ok.length === 1 ? ok[0] : ok;
  }
  const typ = String(job.type || "").toLowerCase();
  const tags = (job.tags || []).map((t) => String(t).toLowerCase());
  const has = (re) => re.test(typ) || tags.some((t) => re.test(t));
  if (has(/\b(1099|contract|contractor|independent)\b/)) return "CONTRACTOR";
  if (has(/\bfull[- ]?time\b/)) return "FULL_TIME";
  if (has(/\bpart[- ]?time\b/)) return "PART_TIME";
  if (has(/\b(temp|temporary|seasonal|cat deployment)\b/)) return "TEMPORARY";
  if (has(/\bintern(ship)?\b/)) return "INTERN";
  if (has(/\bper[- ]?diem\b/)) return "PER_DIEM";
  return "OTHER";
}

// ---------- salary ----------
export function parseSalary(s) {
  if (!s) return null;
  const k = [...String(s).matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*k/gi)].map((m) => Number(m[1]) * 1000);
  if (k.length >= 2) return [k[0], k[1]];
  const d = [...String(s).matchAll(/\$\s*([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  if (d.length >= 2) return [d[0], d[1]];
  return null;
}

// ---------- JSON-LD ----------
/** Why a job gets no JSON-LD (null = emit). */
export function jsonLdSkipReason(job) {
  const apply = job.applyUrl || job.url || "";
  if (job.jsonld === false) return "jsonld:false on record";
  if (!/^https?:\/\//.test(apply)) return "internal/placeholder listing (no external job), not a JobPosting";
  if (/^various$/i.test(job.type || "")) return "multi-listing pointer (type Various), not a single job — Google policy";
  const missing = missingRequired(job);
  if (missing.length) return "missing required: " + missing.join(", ");
  return null;
}
export function missingRequired(job) {
  const m = [];
  if (!job.title) m.push("title");
  if (!Array.isArray(job.description) || !job.description.join("").trim()) m.push("description");
  if (!isValidDate(job.posted)) m.push("posted(datePosted)");
  if (!job.company) m.push("company(hiringOrganization)");
  if (!parseLocation(job).ok) m.push("location(jobLocation/applicantLocationRequirements)");
  if (!resolveValidThrough(job)) m.push("validThrough");
  return m;
}

export function descriptionHtml(job) {
  return (job.description || []).map((p) => `<p>${esc(p)}</p>`).join("");
}

export function buildJsonLd(job) {
  if (jsonLdSkipReason(job)) return null;
  const loc = parseLocation(job);
  const org = { "@type": "Organization", name: job.company };
  if (job.companyUrl) org.sameAs = job.companyUrl;
  if (job.logo) org.logo = job.logo.startsWith("http") ? job.logo : SITE + job.logo;
  const ld = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: descriptionHtml(job),
    datePosted: job.posted,
    validThrough: resolveValidThrough(job).value,
    employmentType: employmentType(job),
    hiringOrganization: org,
    directApply: false,
    url: `${SITE}/jobs/${job.id}.html`,
    identifier: { "@type": "PropertyValue", name: job.company, value: job.id },
  };
  if (loc.places.length) {
    const places = loc.places.map((p) => {
      const a = { "@type": "PostalAddress" };
      if (p.locality) a.addressLocality = p.locality;
      a.addressRegion = p.region;
      a.addressCountry = "US";
      return { "@type": "Place", address: a };
    });
    ld.jobLocation = places.length === 1 ? places[0] : places;
  }
  if (loc.remote) {
    ld.jobLocationType = "TELECOMMUTE";
    const regs = loc.applicantRegions.length ? loc.applicantRegions : [];
    ld.applicantLocationRequirements = regs.length
      ? regs.map((r) => ({ "@type": "State", name: STATES[r] || r }))
      : { "@type": "Country", name: "US" };
  }
  const sal = parseSalary(job.salary);
  if (sal) {
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: "USD",
      value: { "@type": "QuantitativeValue", minValue: sal[0], maxValue: sal[1], unitText: "YEAR" },
    };
  }
  return ld;
}

// ---------- page rendering (byte-compatible with regen_jobs_ctj.py) ----------
function article(w) {
  w = String(w).trim();
  return w && "aeiou".includes(w[0].toLowerCase()) ? "an" : "a";
}
function applyAttrs(job) {
  const url = job.applyUrl || job.url || "/post.html";
  if (job.id === "founding-placeholder" || url.startsWith("/")) {
    return [url, job.id === "founding-placeholder" ? "Request founding post" : "Apply", ""];
  }
  return [url, "Apply on employer site", ' target="_blank" rel="noopener noreferrer"'];
}
function bodyHtml(job) {
  const parts = (job.description || []).map((p) => `<p>${esc(p)}</p>`);
  const apply = job.applyUrl || job.url || "";
  if (job.id === "founding-placeholder") parts.push('<p class="fine">Next step: <a href="/post.html">Post a job</a></p>');
  else if (apply.startsWith("http"))
    parts.push(`<p class="fine">Source listing: <a href="${esc(apply)}" target="_blank" rel="noopener noreferrer">${esc(apply)}</a></p>`);
  if (job.sourceUrl && job.sourceUrl !== apply)
    parts.push(`<p class="fine">Originally posted at: <a href="${esc(job.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(job.sourceUrl)}</a></p>`);
  return parts.join("");
}
function relatedJobs(job, all, n = 3) {
  let others = all.filter((j) => j.id !== job.id && j.id !== "founding-placeholder");
  if (others.length < n) others = all.filter((j) => j.id !== job.id);
  return others.slice(0, n);
}

export function renderJobPage(job, activeJobs) {
  const { id: jid, title, company } = job;
  const blurb = job.blurb || "";
  const pageUrl = `${SITE}/jobs/${jid}.html`;
  const pageTitle = `${title} at ${company} — Open PA Jobs`;
  const metaDesc = blurb || title;
  const hiringLine = `${company} is hiring ${article(title)}`;
  let companyRow = '<div class="job-company-row">';
  if (job.logo)
    companyRow += `<img class="job-company-logo" src="${esc(job.logo)}" alt="${esc(company)} logo" width="48" height="48" loading="lazy" />`;
  companyRow += `<span class="job-company-name">${esc(company)}</span></div>`;
  const chips = ['<div class="job-chips" role="list">'];
  chips.push(`<span class="job-chip" role="listitem">${SVG_PIN}<span>${esc(job.location || "")}</span></span>`);
  chips.push(`<span class="job-chip" role="listitem">${SVG_USER}<span>${esc(job.type || "")}</span></span>`);
  if (job.salary)
    chips.push(`<span class="job-chip job-chip-salary" role="listitem">${SVG_DOLLAR}<span>${esc(job.salary)}</span></span>`);
  chips.push("</div>");
  const tags = job.tags || [];
  const tagsHtml = tags.length
    ? `<div class="job-tags job-page-tags">${tags.map((t) => `<span class="tag">${esc(String(t).toUpperCase())}</span>`).join("")}</div>`
    : "";
  const quick = blurb
    ? '<aside class="job-quick-summary" aria-label="Quick summary"><p class="job-quick-label">Quick summary</p>' +
      `<p class="job-quick-body">${esc(blurb)}</p></aside>`
    : "";
  const [href, label, extra] = applyAttrs(job);
  const applyBar = `<div class="job-apply-bar"><a class="btn btn-primary" href="${esc(href)}"${extra}>${esc(label)}</a><a class="btn btn-ghost" href="/#jobs">All jobs</a></div>`;
  const moreHtml = relatedJobs(job, activeJobs)
    .map((m) => `<li><a href="/jobs/${esc(m.id)}.html"><strong>${esc(m.title)}</strong></a><span class="job-more-meta">${esc(m.company)} · ${esc(m.location)}</span></li>`)
    .join("");
  const noindex = jid === "founding-placeholder" ? '<meta name="robots" content="noindex,follow" />' : "";
  const og =
    `<meta property="og:type" content="website" /><meta property="og:site_name" content="Open PA Jobs" />` +
    `<meta property="og:title" content="${esc(pageTitle)}" /><meta property="og:description" content="${esc(metaDesc)}" />` +
    `<meta property="og:url" content="${esc(pageUrl)}" /><meta property="og:image" content="${SITE}/og-image.png" />` +
    `<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />` +
    `<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(pageTitle)}" />` +
    `<meta name="twitter:description" content="${esc(metaDesc)}" /><meta name="twitter:image" content="${SITE}/og-image.png" />`;
  const plausible = '<script defer data-domain="openpajobs.com" src="https://plausible.io/js/script.js"></script>';
  const ld = buildJsonLd(job);
  const ldHtml = ld
    ? `<!-- BEGIN JOBPOSTING JSON-LD --><script type="application/ld+json">${safeJson(ld)}</script><!-- END JOBPOSTING JSON-LD -->`
    : "";
  const css = ["styles", "board", "polish", "job"].map((c) => `<link rel="stylesheet" href="/${c}.css?v=${CACHE}" />`).join("");
  const head =
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<title>${esc(pageTitle)}</title><meta name="description" content="${esc(metaDesc)}" />` +
    `<link rel="canonical" href="${esc(pageUrl)}" /><link rel="icon" href="${ICON}" />` +
    `<script>\n${THEME_BOOT}\n</script>` +
    `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />` +
    `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet" />` +
    `${css}${og}${plausible}${noindex}${ldHtml}</head>`;
  const header =
    `<header class="job-header">${companyRow}<h1 class="job-title-block"><span class="job-hiring-line">${esc(hiringLine)}</span>` +
    `<span class="job-title-line">${esc(title)}</span></h1>${chips.join("")}${tagsHtml}${quick}${applyBar}</header>`;
  const main =
    `<main><section class="job-page"><div class="wrap job-page-inner"><nav class="job-breadcrumb" aria-label="Breadcrumb">` +
    `<a href="/#jobs">Jobs</a><span aria-hidden="true">/</span><span>${esc(title)}</span></nav>${header}` +
    `<article class="job-body-prose page-prose">${bodyHtml(job)}</article></div></section>` +
    `<section class="job-bottom"><div class="wrap"><div class="job-bottom-grid">` +
    `<div class="job-bottom-card"><h2>Hiring public adjusters?</h2><p>List a licensed PA, apprentice, or firm role on Open PA Jobs. Founding posts are free while we open the board.</p><a class="btn btn-primary" href="/post.html">Post a job</a></div>` +
    `<div class="job-bottom-card"><h2>More openings</h2><ul class="job-more-list">${moreHtml}</ul><p class="fine"><a href="/#jobs">← Back to the job board</a></p></div>` +
    `<div class="job-bottom-card"><h2>Get job alerts</h2><p>New PA roles in your inbox — free, no spam pitch.</p><a class="btn btn-ghost" href="/#alerts">Subscribe to alerts</a></div>` +
    `</div></div></section></main>`;
  const scripts = `<script src="/config.js?v=${CACHE}"></script><script src="/main.js?v=${CACHE}"></script>`;
  return head + "<body>" + NAV + main + FOOTER + scripts + "</body></html>\n";
}

/** Extract and parse every application/ld+json block in an HTML string. */
export function extractJsonLd(html) {
  const out = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(JSON.parse(m[1]));
  return out;
}

/** Google required + key recommended checks. Returns list of problems. */
export function checkGoogleJobPosting(ld) {
  const p = [];
  for (const f of ["title", "description", "datePosted", "hiringOrganization"]) if (!ld[f]) p.push("missing " + f);
  if (ld.hiringOrganization && !ld.hiringOrganization.name) p.push("hiringOrganization.name");
  if (!isValidDate(String(ld.datePosted || "").slice(0, 10))) p.push("datePosted not ISO");
  if (!ld.validThrough || isNaN(new Date(ld.validThrough))) p.push("validThrough not ISO datetime");
  const remote = ld.jobLocationType === "TELECOMMUTE";
  if (!ld.jobLocation && !remote) p.push("missing jobLocation (and not TELECOMMUTE)");
  if (remote && !ld.applicantLocationRequirements) p.push("TELECOMMUTE without applicantLocationRequirements");
  for (const pl of [].concat(ld.jobLocation || [])) {
    const a = pl.address || {};
    if (a.addressCountry !== "US") p.push("addressCountry != US");
    if (!a.addressRegion && !a.addressLocality) p.push("address needs region/locality");
  }
  for (const e of [].concat(ld.employmentType || [])) if (!EMP_ENUM.includes(e)) p.push("bad employmentType " + e);
  if (ld.directApply !== false) p.push("directApply should be false");
  return p;
}
