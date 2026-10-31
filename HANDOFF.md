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

## Current state (31 Oct 2026, 14:10 IST)

- Deployed commit: `e5da674` (+ this handoff). Env has `GENERATION_PAUSED=1`, so **AI generation is paused** (admin page has the Resume switch).
- Meta app **BrandMint AI** id `1435755065405212`, business portfolio `1838532116570701`, in **Development** mode. Use case "Manage everything on your Page" + Instagram permissions added; Facebook Login for Business configuration id `4609074589338735`; keys are in the server env. Live Facebook login worked: customer "AI Full Stack Lab" (owner aifullstacklab.dev@gmail.com) connected Instagram `@aifullstacklab.dev`.
- AI Full Stack Lab, Starter plan, November 2026: ~19 items made and awaiting approval, ~11 on hold (paused).
- Admin login password was recreated after the users-table wipe on 28 Oct (see secrets file).
- Demo customer "Cardamom & Co. Bakery" exists only in the owner's local copy (C:\content-auto\saas), not on the server.

## Next steps (in order)

1. **Live posting test:** owner approves one AI Full Stack Lab post and clicks *Post now*; confirm it lands on the Facebook Page + Instagram; check worker logs for Graph API errors. Owner screen-records it for App Review.
2. Small fix: Activity "Working on now" says "Picking up the next job…" while paused; show "On hold" instead (`src/components/ActivityPanel.tsx`, use `a.paused`).
3. Create a reviewer account in BrandMint (e.g. meta-review@… with demo plan and content to approve) for Meta App Review.
4. Meta: Business Verification → Become a Tech Provider → App Review for pages_show_list, pages_read_engagement, pages_manage_posts, business_management, instagram_basic, instagram_content_publish → Publish (Live). Guide: Claude Docs link above.
5. Real domain (e.g. app.brandmintai.io → 76.13.217.50): set `APP_HOST`, redeploy, update all URLs in the Meta app.
6. Razorpay keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`), test mode first; renewal flow is built (`/app/billing`).
7. Later: Instagram-only login (needs a second Meta app; `INSTAGRAM_APP_ID/SECRET`), Gemini Omni motion video for reels (needs Gemini billing), performance reports (Growth plan), YouTube/LinkedIn/X publishing, Postgres + S3 when scaling.

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
