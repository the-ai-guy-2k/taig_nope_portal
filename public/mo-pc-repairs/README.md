# Mo's PC Repairs and Sales

Business website for Mo (Mohamad Khalil AL Abbar) — laptop sales and PC repairs in Jacksonville, FL.

- Live: https://taigtsp.duckdns.org/mo-pc-repairs/
- Served by the Nope app's Express static middleware from this repo (`public/mo-pc-repairs/index.html`), same pattern as the Jay Garrett EPK. Nginx proxies `/mo-pc-repairs/` to port 3000.
- Single self-contained `index.html` (exported from the Muse web artifact `mo-s-pc-repairs-and-sales`).
- Featured inventory links to Mo's live Facebook Marketplace listings.
- No phone or email on the site — Mo has none on record. Contact is via Facebook Marketplace.
- Deploy: push here, then on the Droplet `git pull` + `docker build` + restart `nope-portal` (see DEPLOY.md).
