# Google Search Console setup for openpajobs.com

Sitemap: https://openpajobs.com/sitemap.xml (already referenced in robots.txt and rebuilt daily by GitHub Actions)

## 1. Add a Domain property
1. Go to https://search.google.com/search-console and sign in with the Google account that should own the site.
2. Click the property drop-down (top left), then **Add property**.
3. Choose **Domain** (left box, not "URL prefix"). Enter `openpajobs.com` with no `https://` and no `www`. Click **Continue**.
4. Google shows a TXT record like `google-site-verification=AbCdEf123...`. Click **Copy**. Leave this tab open and do NOT click Verify yet.

## 2. Add the TXT record at Squarespace (Squarespace Domains)
1. Sign in at https://account.squarespace.com/domains, then click **openpajobs.com**.
2. Open **DNS** (on some accounts it's **DNS Settings**).
3. Under **Custom records**, click **Add record**. Leave the GitHub Pages A/CNAME records alone.
4. Set Type to **TXT**, Host to **@**, and paste the full `google-site-verification=...` string as Data/Value. Leave TTL at the default.
5. Click **Save**.
6. Optional check from a terminal: `dig +short TXT openpajobs.com` should list the google-site-verification string. This usually takes a few minutes, and can take up to 48 hours.

## 3. Verify
1. Go back to the Search Console tab and click **Verify**.
2. If it fails with "TXT record not found", wait 15–60 minutes and try again. Don't delete the record after verifying, because Google re-checks it.

## 4. Submit the sitemap
1. Select the property **openpajobs.com**, then go to **Indexing > Sitemaps**.
2. Under "Add a new sitemap", enter `sitemap.xml` and click **Submit**.
3. Status should change to **Success** and show the discovered URL count (about 130 today: static pages, about 25 state pages, and the job pages).

## 5. Request indexing for key URLs
Use **URL inspection** (search bar at the top) for each URL, then **Request indexing**. Google allows roughly 10–12 requests a day, so do them in priority order:
1. https://openpajobs.com/
2. https://openpajobs.com/jobs/florida/
3. https://openpajobs.com/jobs/texas/
4. https://openpajobs.com/jobs/remote/
5. https://openpajobs.com/jobs/california/
6. https://openpajobs.com/jobs/new-york/
7. https://openpajobs.com/jobs/pennsylvania/
8. A few of the newest job pages under https://openpajobs.com/jobs/*.html
After inspecting a job URL, click **View tested page / Test live URL** and confirm the "Job posting" enhancement shows as valid.

## 6. Monitor
- **Enhancements > Job postings** appears after Google parses the JobPosting markup. Fix any errors it reports. Warnings for missing baseSalary are expected, because salary is only shown when the employer publishes it.
- **Indexing > Pages** tracks coverage. Expired jobs are removed from the site and the sitemap, so they'll show up as 404 and drop out. That's expected.
- Optional spot check: https://search.google.com/test/rich-results with a job URL.

## Indexing API note (JobPosting)
Google's Indexing API officially supports only pages with JobPosting (or BroadcastEvent in VideoObject) markup, which is the case for openpajobs job pages. It gets new or updated jobs crawled within minutes to hours instead of days, and `URL_DELETED` drops expired jobs quickly. Setup:
1. In Google Cloud Console, create a project and enable the **Web Search Indexing API**.
2. Create a service account and a JSON key. Store the key as a GitHub Actions secret, never in the repo.
3. In Search Console, go to **Settings > Users and permissions > Add user**, add the service-account email as an **Owner** (required).
4. In the daily rebuild, call `POST https://indexing.googleapis.com/v3/urlNotifications:publish` with `{"url": "...", "type": "URL_UPDATED"}` for new or changed job URLs and `URL_DELETED` for removed ones (`build-report.json` lists `removedPages`). The default quota is 200 publish requests a day.
Only send job-page URLs, not state or static pages. Google says the API is for JobPosting/livestream pages only, and using it for other pages may be ignored or treated as abuse.
