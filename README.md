# Open PA Jobs

Public adjuster job board MVP — static site on GitHub Pages.

**Repo:** https://github.com/joshuaread/openpajobs  
**Preview (after Pages on):** https://joshuaread.github.io/openpajobs/  
**Custom domain:** openpajobs.com

## DNS (Squarespace Domains)

Same pattern as slatecliff.com:

1. For `openpajobs.com` set:
   - **A records** for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - **OR** ALIAS/ANAME `@` → `joshuaread.github.io` if supported
   - **CNAME** `www` → `joshuaread.github.io`
2. Repo `CNAME` already has `openpajobs.com`.
3. After DNS propagates, enable **Enforce HTTPS** in GitHub Pages settings.

## Forms (Web3Forms)

Alerts + post-a-job use Web3Forms. In the dashboard, add **openpajobs.com** (and www if used) to allowed domains.

## Edit listings

Edit `jobs.json` on `main` and push — the board reloads from that file.
