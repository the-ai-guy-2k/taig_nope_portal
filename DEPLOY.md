# Nope App — Droplet Deploy Plan (backfilled Nov 3, 2026)

## Rules (Tee, Nov 3, 2026 — locked)
- **GitHub is the source of truth.** Everything goes through GitHub.
- **Droplet is pull-only.** The Droplet (138.68.226.24, 2 vCPU / 2 GB / 60 GB, Ubuntu 24.04) only pulls apps from GitHub. No edits on the box, no pushes from the box, no local-only builds that bypass GitHub. Change in GitHub first, then Droplet `git pull` + rebuild from what it pulled.
- **Nope App intent (locked Nov 3, 2026):** TAIG Business Dashboard with the tree map as a feature, hosted on a Droplet.
- **Primary management:** a Linux box SSHing into the Droplet (Muse's Linux box, on Tee's instructions). The Windows local management app via the DigitalOcean API is secondary, for platform moves only (create / reboot / resize / snapshot / destroy).
- **SSH key:** `tee-nope-droplet` (ed25519). Private key stays on the managing Linux box; public key is added to DigitalOcean at Droplet creation. Fingerprint SHA256:O4lvoqP7E6V+BrshR5+SPNXEj88Gbc3m3Vd+ok1qZTI.
- **Public URL:** DigitalOcean gives the public IP (138.68.226.24). No other provider is needed for IP access. A pretty domain name is not included by DigitalOcean — that name must be registered elsewhere and pointed at the Droplet; the domain is the truly non-changing URL layer.

## What's on the Droplet (Nov 3, 2026)
| App / page | Route | Source |
|---|---|---|
| Nope portal (Express, port 3000, Nginx port 80) | / , /dashboard | this repo, `taig_nope_portal` |
| Work Week Plan (Nov 2–6, 2026) | /work-week-plan | this repo, views/work-week-plan.ejs |
| Daily Work Log (381 items listed, Oct 10–30, 2026) | /daily-work-log | this repo, views/daily-work-log.ejs |
| Tree Map (v3 data model, as-is) | /tree-map | this repo, views/tree-map.ejs |
| Business Dashboard snapshot (Oct 21, 2026) | /business-dashboard/ | static file, see note below |
| Jay Garrett EPK | /jay-epk/ | static file, see note below |

## Static files — status (Nov 3, 2026)
- Jay Garrett EPK: pushed as-is to GitHub in this repo at `public/jay-epk/index.html` (87,390,683 bytes, inlined assets, MD5 6cc22a01b2d88f38614cbc491204c340 — same file as the Muse artifact export). It is served by the Nope app's Express static middleware from the pulled repo, not from a manual `/var/www` copy. Slimming into separate audio/artwork files is still a future option for load speed, not a GitHub requirement.
- Business Dashboard snapshot (32 KB) in `/var/www/business-dashboard/` is still NOT in GitHub — it remains the one pull-only exception. Do not hide this gap.

## Deploy steps (pull-only)
1. Change code in GitHub (branch + review as normal).
2. On the Droplet: `cd /root/taig_nope_portal && git pull --ff-only`
3. Rebuild from pulled code: `docker build -t taig-nope-portal:local .`
4. Restart: `docker rm -f nope-portal && docker run -d --name nope-portal --restart unless-stopped -p 3000:3000 -v nope-nebula-local:/app/nebula_local taig-nope-portal:local`
5. Verify on the box: `/health` ok, `/dashboard`, `/work-week-plan`, `/daily-work-log`, `/tree-map` all HTTP 200, Nginx routes for `/business-dashboard/` and `/jay-epk/` still 200.

## Backups
Own backups, not DigitalOcean paid backups: nightly data + config dump copied OFF the box (a backup that only lives on the Droplet is not a backup). Code is already safe in GitHub.
