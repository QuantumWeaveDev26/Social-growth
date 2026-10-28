# BrandMint AI: content studio SaaS

Customers buy a plan, describe their business and connect Facebook and Instagram. BrandMint AI then writes a brand profile, plans the month, and makes every post and reel. The customer approves each piece or asks for changes. Approved content posts itself on schedule.

```
saas/
  web/     Next.js app: landing, signup, onboarding, proof sheet, review, admin, plus the background worker
  video/   Remotion project that renders reels (ReelShort composition)
```

## Run it locally

You need Node 20 or newer.

```bash
cd video && npm install
cd ../web && npm install
cp .env.example .env        # then fill AUTH_SECRET (any long random string) and AI_GATEWAY_KEY
npm run db:push             # creates dev.db
npm run db:seed             # plans + admin user (admin@brandmintai.io / change-me-now)
npm run dev                 # app on http://localhost:3000
npm run worker              # in a second terminal: makes content and publishes
```

The bundled `dev.db` and `storage/` hold the demo customer "Cardamom & Co. Bakery". Sign in as `ananya@cardamom.test` / `bakery-2026` to see a real generated month. To start clean, delete `dev.db` and `storage/`, then run `db:push` and `db:seed` again.

## How the pieces connect

| Step | Where | What happens |
|---|---|---|
| Plan and payment | `/onboarding` step 1 | Razorpay order and checkout. With no keys it activates a demo plan. |
| Business details and brand kit | steps 2–3 | Form, logo upload, colours and posting times (IST). |
| Brand profile | worker `brand_profile` job | Reads the form and website, uses `src/playbooks/saas/brand_profile.md`. Owner confirms or corrects it. |
| Month plan | worker `plan_month` job | Exact quota from the plan (posts + reels), no repeated topics, spread across the month at the posting times. |
| Each post | worker `generate_item` job | Copy, then editor pass with automatic checks, then gpt-image-1.5 image, then logo composited with sharp. |
| Each reel | same job | 4 scene images, ElevenLabs v4 voice (Sarah) with word timings, then Remotion render with captions. |
| Approval | `/app` and `/app/items/[id]` | Approve, approve all, or "remake with my note". Notes feed the next version. Revisions per item come from the plan. |
| Publishing | worker, every 30 s | Approved items whose time has come go to the Facebook Page and Instagram via the Graph API. With no Meta keys it simulates. |
| Operations | `/admin` | Customers, revenue, AI spend per customer, job log, retry and pause. |

All model calls go through the n8n Asset API (`AI_GATEWAY_URL`), which holds the OpenAI and ElevenLabs keys.

## Going live

1. **Meta.** Create a Meta app (Business type) and add Facebook Login for Business. Request `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish` and `business_management`. Set the redirect URL to `APP_URL/api/meta/callback`. Pass App Review and Business Verification, then set `META_APP_ID` and `META_APP_SECRET`.
2. **Razorpay.** Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Use test keys first.
3. **Public URL.** Meta downloads media from `APP_URL/media/...`, so the app must be on a public HTTPS domain.
4. **Hosting.** Run the web app and the worker as two processes on one VPS (for example the Hostinger box that runs n8n), or move storage to S3/R2 and the database to Postgres for scale.
5. **Video.** Reels currently use AI stills with motion, voice and captions. Generated motion video (Gemini Omni) plugs into the same reel step once Gemini billing is on.

## Deployment (Hostinger VPS)

The server builds this repo straight from GitHub (`docker-compose.yml`), behind the n8n Traefik proxy that already handles HTTPS.

- Project name: `brandmint` · services `web` (Next.js on port 3000) and `worker` (jobs, rendering, publishing)
- Data (SQLite database and media) lives in the `brandmint-data` volume, mounted at `/data`
- Required project environment: `APP_HOST`, `AUTH_SECRET`, `TOKEN_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AI_GATEWAY_URL`, `AI_GATEWAY_KEY`, plus the AI, Meta and Razorpay variables from `web/.env.example`
- To ship an update: push to `main`, then redeploy the `brandmint` project (it rebuilds from GitHub)

### Database changes

`drizzle-kit push` runs only when the database file doesn't exist yet. Existing databases are upgraded by the additive migrations in `web/src/db/index.ts` (`migrate()`): add every new column or table there as `alter table … add column` / `create table if not exists`. Never run `drizzle-kit push --force` against a live database; it can empty tables. The web container also copies the database to `/data/pre-start-backup.db` on every start, and the worker keeps 7 nightly backups in `/data/backups`.
