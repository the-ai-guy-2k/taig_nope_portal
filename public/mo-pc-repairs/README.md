# Abbar Tech — Computer Sales & Services

Business website for Mo (Mohamad Khalil AL Abbar) — laptop sales and PC repairs in Jacksonville, FL.

Rebranded Nov 16, 2026 from Mo's PC Repairs and Sales — company name, tagline and logo from Mo's Facebook Marketplace profile (Abbar Tech, Computer Sales & Services).

- Live: https://taigtsp.duckdns.org/mo-pc-repairs/
- Served by the Nope app's Express static middleware from this repo (`public/mo-pc-repairs/index.html`), same pattern as the Jay Garrett EPK. Nginx proxies `/mo-pc-repairs/` to port 3000.
- Single self-contained `index.html` (exported from the Muse web artifact `mo-s-pc-repairs-and-sales`). Logo embedded as a data URI from Mo's Marketplace profile cover (Nov 16, 2026 rebrand).
- Featured inventory links to Mo's live Facebook Marketplace listings.
- No phone or email on the site — Mo has none on record. Contact is via Facebook Marketplace.
- Deploy: push here, then on the Droplet `git pull` + `docker build` + restart `nope-portal` (see DEPLOY.md).
- Updated Nov 21, 2026: added Latitude 5410 ($200), Latitude 9510 2-in-1 ($300), Latitude 5580 ($160) — all listed Nov 20, 2026, with Mo's actual listing photos. The ThinkPad L490 listing is no longer retrievable on Marketplace; left on the site pending Mo's word (Tee's rule: site stays as current truth until Mo updates him).
