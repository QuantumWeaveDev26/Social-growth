# BrandMint AI — handoff (31 Oct 2026)

Read this first if you are a new Claude session picking up this project. Secrets are **not** in this repo (it is public); the owner (Naveen) has them in a private file called `HANDOFF-SECRETS.txt`.

## What this is

A SaaS for Indian small businesses: the customer buys a monthly plan, describes the business, connects Facebook + Instagram, and BrandMint AI writes a brand profile, plans the month, makes every post and reel, waits for the customer's approval, then publishes on schedule.

- Live (temporary domain): https://brandmint.76.13.217.50.sslip.io
- Admin: https://brandmint.76.13.217.50.sslip.io/admin (login in the secrets file)
- Repo: https://github.com/QuantumWeaveDev26/Social-growth (branch `main`)
- Meta app setup guide (Claude Docs): https://claude.ai/artifact/Ag1z8JoBacm5tGQGZJMaWT

## Layout

```
web/     Next.js 15 (App Router, TS, Tailwind 4) app + background worker
  src/db/schema.ts        Drizzle schema (SQLite via better-sqlite3)
  src/db/index.ts         DB singleton + ADDITIVE migrate()  <- every schema change goes here
  src/lib/engine.ts       brand profile, month plan, post/reel generation, publishing, connection sync
  src/lib/meta.ts         Facebook Login for Business, Instagram Login, Graph API publishing, callbacks
  src/lib/ai.ts           all AI calls go through the n8n gateway (AI_GATEWAY_URL)
  src/lib/notify.ts       in-app notifications + email (gateway type "email" -> Gmail)
  src/lib/cycle.ts        daily tasks: backup 03:00, billing 06:00, plan next month 07:00, approvals digest 10:00 (IST)
  src/lib/billing.ts      30-day periods, payments table
  src/lib/jobs.ts         DB job queue, generation pause switch
  src/lib/activity.ts     live activity feed
  src/playbooks/saas/     prompts: brand_profile, month_plan, post, reel, editor
  scripts/worker.ts       job runner + publisher + heartbeat + daily tasks
  scripts/seed.ts         plans + admin user
video/   Remotion 4 project; composition ReelShort renders reels (4 scene images + ElevenLabs voice + captions)
Dockerfile, docker-compose.yml, docker/entrypoint.sh   production image
```

Customer pages: `/onboarding` (plan → business → brand kit → connect Meta → brand profile), `/app` proof sheet, `/app/items/[id]` review (approve / remake with note / post now), `/app/activity`, `/app/notifications`, `/app/brand`, `/app/settings` (Connections), `/app/billing`, `/app/account`. Auth: `/login`, `/signup`, `/forgot`, `/reset`. Legal: `/privacy`, `/data-deletion`.

## Infrastructure

- **Hostinger VPS** id `1871828` (srv1871828.hstgr.cloud, 76.13.217.50, Ubuntu + n8n). Other projects run there too; don't touch them.
- Docker project **`brandmint`**: services `web` (port 3000) and `worker`, volume `brandmint-data` at `/data` (SQLite `brandmint.db`, `storage/` media, `backups/` 7 nightly, `pre-start-backup.db`). Routed by the n8n Traefik container (network `n8n_default`, cert resolver `mytlschallenge`) using an sslip.io hostname.
- **Deploy:** push to `main`, then Hostinger API `vps_docker_create` with `project_name: brandmint`, `content: https://raw.githubusercontent.com/QuantumWeaveDev26/Social-growth/main/docker-compose.yml` and the **full** environment string (read the current one first with `vps_docker_get` and pass it back unchanged plus your edits). `vps_docker_update` does NOT rebuild. Build ≈ 1–5 min. Check with `vps_docker_logs`.
- **n8n** at https://n8n.srv1871828.hstgr.cloud. Workflow `R7fBOgeK8Ppb89WY` "Content Asset API" = the AI gateway (`/webhook/asset-api`, header `x-qw-key`): types `image` (OpenAI gpt-image-1.5), `tts` (ElevenLabs eleven_v4, voice Sarah `EXAVITQu4vr4xnSDxMaL`), `voices`, `chat` (OpenAI chat completions), `email` (Gmail credential "Gmail account").

## Hard rules (learned the hard way)

1. **Never run `drizzle-kit push --force` on the live database.** It emptied the users table once. The entrypoint only pushes when the DB file doesn't exist; existing DBs upgrade through `migrate()` in `src/db/index.ts` (`alter table … add column`, `create table if not exists`).
2. Every redeploy must pass the whole environment back; a missing var silently falls back to defaults.
3. AI generation costs the owner's OpenAI/ElevenLabs credit (~$0.14 per post, ~$0.9 per reel, ~$7 for a 26+4 month). Keep generation paused while testing; resume deliberately.
4. Ask before sending emails or posting to real accounts on the owner's behalf.

## Current state (31 Oct 2026, 18:45 IST)

- Deployed: latest `main` on the VPS. Env still has `GENERATION_PAUSED=1` (AI generation paused).
- Live posting works: Post now published to the AI Full Stack Lab Facebook Page + @aifullstacklab.dev.
- Facebook native scheduling: worker (`syncFacebookSchedule` in engine.ts) creates a scheduled Page post (photo uploaded unpublished + `/feed` with `attached_media`, `scheduled_publish_time`) for approved image posts 15 min–28 days ahead → visible in Business Suite → Scheduled. publish_jobs statuses: `meta_scheduled`, `fired`, `cancelled`, `schedule_failed`. Removed on pull back / remake / time change / Post now; `publishDue` checks `is_published` so nothing posts twice. Instagram + reels are worker-published at slot time.
- Client `/app/schedule`: month calendar (default) + list view. Post now shows "Posting now…" then "Posted" with links.
- Plans = website: `starter` "Stay Active" ₹3,999 (8+2), `growth` "Reach More Customers" ₹6,999 (12+4), 1 revision per item; `scale` retired by seed. ₹0 7-day free trial (website) NOT built.
- Admin rebuilt: tabs Overview / Clients (`/admin/customers`, search/filter/sort/paging, `src/lib/adminData.ts`) / Live activity / Failed jobs.
- Legal: `/terms`, `/refunds` (refund rules are a DRAFT, owner to confirm), signup consent line. Contact page still needs registered address + phone.
- Docs (Claude Docs, owner's account): Go-live checklist https://claude.ai/artifact/8hEnqT2BUmfyPScdjJQ9iP · AI cost breakdown https://claude.ai/artifact/Bd3oqXtKQ2Vih7SHFcRt7a · Onboarding fields https://claude.ai/artifact/9veWwaGsKCW7RdH3xyTrG2
- TeamSync project: "BrandMint AI – Social Media Content Automation" (stages, update, decisions, tasks 7–11).
- AI costs (list prices): image post ≈ $0.15, reel ≈ $0.86, an edit = full remake (same cost). Images at gpt-image-1.5 "high"; gpt-image-1.5 is marked deprecated by OpenAI.
- brandmintai.io DNS is NOT on this Hostinger account (owner must add records).

## Next steps (in order)

1. Owner adds DNS A record `app.brandmintai.io → 76.13.217.50`; then set `APP_HOST`, redeploy, update Meta app URLs (see Go-live checklist).
2. Meta Business Verification → reviewer test account (owner OK, ~$1–3 AI) → screencast → App Review (6 permissions) → switch app to Live.
3. Razorpay KYC + live keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`); Contact page with address/phone.
4. Reel editing upgrade (awaiting go-ahead): AI edit-plan playbook, 4 styles, @remotion/transitions, hook/end cards, smart edits (re-render / text-only / single scene). Check Remotion licence (free ≤3 employees).
5. Small: text-only edits keep the image; schedule calendar should open on the month of the next post (not yet built); free trial; off-site backups; replace gpt-image-1.5.

## Run locally

```bash
cd video && npm install
cd ../web && npm install --ignore-scripts   # Windows: native modules ship prebuilt
cp .env.example .env    # fill AUTH_SECRET, AI_GATEWAY_URL, AI_GATEWAY_KEY
npm run db:push && npm run db:seed   # fresh local DB only
npm run dev     # http://localhost:3000
npm run worker  # second terminal
```
On the owner's Windows PC the project also lives in `C:\content-auto\saas` with `run-brandmint.bat` (start) and `start-brandmint.bat` (install + start). That copy is older than this repo.

## Owner preferences

Naveen (Brandmint AI Private Limited) wants short, direct answers and ready-to-use steps with exact links; he works fast and dislikes long waits without updates. Indian context (INR, IST, GST-inclusive pricing).
