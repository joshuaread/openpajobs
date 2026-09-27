#!/usr/bin/env python3
"""
Week-1 SEO pass for openpajobs.com (static GitHub Pages site).

Idempotent: safe to re-run. For each HTML page:
  - ensures <link rel="canonical"> (derived from file path)
  - ensures og:type / og:url / og:site_name / og:image (+ twitter:card family)
  - injects Plausible analytics snippet (data-domain=openpajobs.com)
For job pages (jobs/*.html, excluding founding-placeholder):
  - injects JobPosting JSON-LD built from jobs.json
For jobs/founding-placeholder.html:
  - adds <meta name="robots" content="noindex,follow"> (not a real job posting)
For index.html:
  - injects Organization + WebSite JSON-LD
Also:
  - removes jobs/founding-placeholder.html from sitemap.xml
  - writes /llms.txt
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://openpajobs.com"
OG_IMAGE = f"{SITE}/og-image.png"

PLAUSIBLE_SNIPPET = (
    '<script defer data-domain="openpajobs.com" '
    'src="https://plausible.io/js/script.js"></script>'
)

EMPLOYMENT_TYPE = {
    "metro-apprentice": "OTHER",
    "coastal-ctg": "CONTRACTOR",
    "aaa-pa": "OTHER",
    "metro-claims-rep": "OTHER",
    "rockwall-austin": "FULL_TIME",
    "statewide-pa": "OTHER",
    "fapia-board": "OTHER",
}

# best-effort structured location; fall back to a free-text place
LOCATION_HINTS = {
    "metro-apprentice": {"addressCountry": "US"},  # multi-state
    "coastal-ctg": {"addressCountry": "US"},  # remote
    "aaa-pa": {"addressCountry": "US"},
    "metro-claims-rep": {"addressLocality": "Philadelphia", "addressRegion": "PA", "addressCountry": "US"},
    "rockwall-austin": {"addressLocality": "Austin", "addressRegion": "TX", "addressCountry": "US"},
    "statewide-pa": {"addressCountry": "US"},
    "fapia-board": {"addressRegion": "FL", "addressCountry": "US"},
}

REMOTE_IDS = {"coastal-ctg", "metro-claims-rep"}


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def write(p: Path, s: str):
    p.write_text(s, encoding="utf-8")


def get_meta(html: str, name: str, attr: str = "name") -> str:
    m = re.search(rf'<meta {attr}="{re.escape(name)}" content="([^"]*)"', html)
    return m.group(1) if m else ""


def get_title(html: str) -> str:
    m = re.search(r"<title>([^<]*)</title>", html)
    return m.group(1) if m else "Open PA Jobs"


def canonical_url_for(rel_path: str) -> str:
    # rel_path like "index.html", "jobs/rockwall-austin.html", "locations/tx.html"
    if rel_path == "index.html":
        return f"{SITE}/"
    return f"{SITE}/{rel_path}"


def ensure_head_tags(html: str, rel_path: str) -> str:
    title = get_title(html)
    desc = get_meta(html, "description")
    canon = canonical_url_for(rel_path)

    additions = []

    if 'rel="canonical"' not in html:
        additions.append(f'<link rel="canonical" href="{canon}" />')

    if 'property="og:type"' not in html:
        additions.append('<meta property="og:type" content="website" />')
    if 'property="og:site_name"' not in html:
        additions.append('<meta property="og:site_name" content="Open PA Jobs" />')
    if 'property="og:title"' not in html:
        additions.append(f'<meta property="og:title" content="{title}" />')
    if 'property="og:description"' not in html and desc:
        additions.append(f'<meta property="og:description" content="{desc}" />')
    if 'property="og:url"' not in html:
        additions.append(f'<meta property="og:url" content="{canon}" />')
    if 'property="og:image"' not in html:
        additions.append(f'<meta property="og:image" content="{OG_IMAGE}" />')
        additions.append('<meta property="og:image:width" content="1200" />')
        additions.append('<meta property="og:image:height" content="630" />')

    if 'name="twitter:card"' not in html:
        additions.append('<meta name="twitter:card" content="summary_large_image" />')
    if 'name="twitter:title"' not in html:
        additions.append(f'<meta name="twitter:title" content="{title}" />')
    if 'name="twitter:description"' not in html and desc:
        additions.append(f'<meta name="twitter:description" content="{desc}" />')
    if 'name="twitter:image"' not in html:
        additions.append(f'<meta name="twitter:image" content="{OG_IMAGE}" />')

    if additions:
        block = "".join(additions)
        html = html.replace("</head>", block + "</head>", 1)
    return html


def ensure_analytics(html: str) -> str:
    if "plausible.io/js/script.js" in html:
        return html
    return html.replace("</head>", PLAUSIBLE_SNIPPET + "</head>", 1)


def job_posting_ldjson(job: dict) -> str:
    jid = job["id"]
    hints = LOCATION_HINTS.get(jid, {"addressCountry": "US"})
    ld = {
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        "title": job["title"],
        "description": " ".join(job.get("description", [job.get("blurb", "")])),
        "datePosted": job.get("posted"),
        "employmentType": EMPLOYMENT_TYPE.get(jid, "OTHER"),
        "hiringOrganization": {
            "@type": "Organization",
            "name": job["company"],
        },
        "jobLocation": {
            "@type": "Place",
            "address": {
                "@type": "PostalAddress",
                **hints,
            },
        },
        "directApply": False,
        "url": f"{SITE}/jobs/{jid}.html",
        "identifier": {
            "@type": "PropertyValue",
            "name": "Open PA Jobs",
            "value": jid,
        },
    }
    if jid in REMOTE_IDS:
        ld["jobLocationType"] = "TELECOMMUTE"
        ld["applicantLocationRequirements"] = {
            "@type": "Country",
            "name": "USA",
        }
    if job.get("salary"):
        # salary strings like "$90k – $140k" / "$45k – $75k OTE" — best-effort parse
        m = re.findall(r"\$([\d.]+)k", job["salary"])
        if len(m) >= 2:
            ld["baseSalary"] = {
                "@type": "MonetaryAmount",
                "currency": "USD",
                "value": {
                    "@type": "QuantitativeValue",
                    "minValue": float(m[0]) * 1000,
                    "maxValue": float(m[1]) * 1000,
                    "unitText": "YEAR",
                },
            }
    return json.dumps(ld, ensure_ascii=False)


def inject_ldjson(html: str, ld_json_str: str) -> str:
    marker_start = "<!-- BEGIN JOBPOSTING JSON-LD -->"
    marker_end = "<!-- END JOBPOSTING JSON-LD -->"
    if marker_start in html:
        html = re.sub(
            rf"{re.escape(marker_start)}.*?{re.escape(marker_end)}",
            f'{marker_start}<script type="application/ld+json">{ld_json_str}</script>{marker_end}',
            html,
            flags=re.S,
        )
        return html
    block = f'{marker_start}<script type="application/ld+json">{ld_json_str}</script>{marker_end}'
    return html.replace("</head>", block + "</head>", 1)


def process_job_pages():
    jobs = json.loads(read(ROOT / "jobs.json"))
    by_id = {j["id"]: j for j in jobs}
    jobs_dir = ROOT / "jobs"
    for f in sorted(jobs_dir.glob("*.html")):
        rel = f"jobs/{f.name}"
        html = read(f)
        html = ensure_head_tags(html, rel)
        html = ensure_analytics(html)
        jid = f.stem
        if jid == "founding-placeholder":
            if 'name="robots"' not in html:
                html = html.replace(
                    "</head>",
                    '<meta name="robots" content="noindex,follow" />' + "</head>",
                    1,
                )
        elif jid in by_id:
            ld = job_posting_ldjson(by_id[jid])
            html = inject_ldjson(html, ld)
        write(f, html)
        print(f"updated {rel}")


def process_generic_pages():
    for f in sorted(ROOT.glob("*.html")):
        rel = f.name
        html = read(f)
        html = ensure_head_tags(html, rel)
        html = ensure_analytics(html)
        if rel == "index.html":
            org_ld = {
                "@context": "https://schema.org/",
                "@type": "Organization",
                "name": "Open PA Jobs",
                "url": f"{SITE}/",
                "logo": f"{SITE}/logos/open-pa-jobs.svg",
                "description": "A niche U.S. job board for public adjusters — licensed desks, apprentices, and PA firm roles.",
            }
            site_ld = {
                "@context": "https://schema.org/",
                "@type": "WebSite",
                "name": "Open PA Jobs",
                "url": f"{SITE}/",
                "potentialAction": {
                    "@type": "SearchAction",
                    "target": f"{SITE}/?q={{search_term_string}}",
                    "query-input": "required name=search_term_string",
                },
            }
            marker_start = "<!-- BEGIN SITE JSON-LD -->"
            marker_end = "<!-- END SITE JSON-LD -->"
            block = (
                f'{marker_start}'
                f'<script type="application/ld+json">{json.dumps(org_ld, ensure_ascii=False)}</script>'
                f'<script type="application/ld+json">{json.dumps(site_ld, ensure_ascii=False)}</script>'
                f'{marker_end}'
            )
            if marker_start in html:
                html = re.sub(rf"{re.escape(marker_start)}.*?{re.escape(marker_end)}", block, html, flags=re.S)
            else:
                html = html.replace("</head>", block + "</head>", 1)
        write(f, html)
        print(f"updated {rel}")


def process_location_pages():
    loc_dir = ROOT / "locations"
    if not loc_dir.exists():
        return
    for f in sorted(loc_dir.glob("*.html")):
        rel = f"locations/{f.name}"
        html = read(f)
        html = ensure_head_tags(html, rel)
        html = ensure_analytics(html)
        write(f, html)
        print(f"updated {rel}")


def clean_sitemap():
    p = ROOT / "sitemap.xml"
    html = read(p)
    new = re.sub(
        r"\s*<url>\s*<loc>https://openpajobs\.com/jobs/founding-placeholder\.html</loc>\s*</url>",
        "",
        html,
    )
    if new != html:
        write(p, new)
        print("removed founding-placeholder from sitemap.xml")


def write_llms_txt():
    p = ROOT / "llms.txt"
    content = """# Open PA Jobs

> A niche U.S. job board for public adjusters (property-claims professionals
> who represent policyholders, not insurance carriers). Lists licensed PA
> desks, apprentice/training roles, claims-rep roles, and PA-firm openings.

Open PA Jobs is not affiliated with NAPIA, FAPIA, or any insurance carrier,
and is not an employment agency. Listings link out to the employer's or
source board's original posting.

## Key pages
- Homepage / live job board: https://openpajobs.com/
- Post a job: https://openpajobs.com/post.html
- Pricing: https://openpajobs.com/pricing.html
- Career guide (become a public adjuster): https://openpajobs.com/become-a-public-adjuster.html
- Salaries: https://openpajobs.com/salaries.html
- Role types: https://openpajobs.com/roles.html
- Remote PA jobs: https://openpajobs.com/remote.html
- Jobs by location: https://openpajobs.com/locations.html
- Companies hiring: https://openpajobs.com/companies.html
- About: https://openpajobs.com/about.html

## Contact
joshua.gray.read@gmail.com
"""
    write(p, content)
    print("wrote llms.txt")


if __name__ == "__main__":
    process_generic_pages()
    process_location_pages()
    process_job_pages()
    clean_sitemap()
    write_llms_txt()
    print("done")
