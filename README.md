# Studio Setup QC

Pre-recording setup approval tool for the Studio QA/Capture team. Set Directors submit setup previews before filming, QC approves or returns them with required fixes, and SPLs get alerted when a setup fails.

## Run it

Requires Node.js 22+.

```bash
npm install
npm start
```

Copy `.env.example` to `.env`, fill in the email (SMTP) settings, then open http://localhost:3000. Locally the database is an embedded Postgres (PGlite) in `data/pg` and uploads go to `data/uploads`; nothing else needs installing.

**How it's built:** static pages in `public/`, an Express API in `src/app.js` (run by `server.js` locally and by a Netlify Function online), Postgres for data, and chunked file storage for photos and videos (local disk, or Netlify Blobs online).

## Signing in and access

People sign in with their **email and a 6-digit code** sent to that address. The team list (the roster in `config/team.js` plus people added on the Team page) decides each person's role and studio.

- **Company emails** (`ALLOWED_DOMAINS`, default `atlascapture.io`) on the team list sign in straight away.
- **External emails** (Gmail, partner domains, etc.) need an admin or manager to approve them once. Approve them ahead of time on the **Team** page (Sign-in column → Approve), or wait for the person to request access the first time they try to sign in.
- **People not on the team** can request access from the login page (name, role, studio, note). Admins and the SPL of the requested studio get an in-app notification and an email, and approve or deny it from the **Team** page. The requester is emailed when they're approved.
- **Who approves:** Admins approve anyone; SPLs approve Set Directors and Coordinators for their own studio. Revoking approval signs the person out immediately.

**Email is required for real use.** Until SMTP is configured the app runs in *test mode*: sign-in codes are shown on screen instead of being emailed, which means anyone who knows a team member's email could sign in as them. Configure SMTP before inviting the team. The same settings send ticket notifications: QC is emailed when a photo is submitted, the SD when it's approved or returned, and the SPL when it's returned.

To send from Google Workspace: create (or pick) a sender account such as `noreply@atlascapture.io`, turn on 2-Step Verification for it, create an **App Password**, and set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS` (the app password), `MAIL_FROM` and `APP_URL` in `.env`. Email stays off until `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are all set. Check the setup with:

```bash
npm run test-email -- you@atlascapture.io
```

## Google sign-in (optional)

You can also offer "Sign in with Google" alongside email codes. The same access rules apply: the Google account's email must be on the team list, and external emails need approval.

**One-time setup in Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)):

1. Create a project (or pick an existing one).
2. **APIs & Services → OAuth consent screen**: choose **External** user type. Many roster accounts are personal `@gmail.com` addresses, and *Internal* would only allow `@atlascapture.io` Workspace accounts. Fill in the app name and support email, keep the default scopes (email, profile, openid), and **Publish** the app. In *Testing* mode only listed test users can sign in. These basic scopes don't need Google verification.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*.
   Under **Authorized JavaScript origins**, add `http://localhost:3000` and your production URL (e.g. `https://setup-qc.atlascapture.io`). No redirect URIs are needed.
4. Copy the client ID (`…apps.googleusercontent.com`) into `.env` as `GOOGLE_CLIENT_ID`, then restart.

**The roster:** locally, `config/team.js` (not in git; copy `config/team.example.js` to start) syncs into the database whenever it changes: emails, roles and studios are updated, new people are added, and roster people removed from the file are deactivated and signed out (their tickets stay). Online there is no roster file: run `node scripts/export-roster.js` to make `config/team.json`, then upload it on the **Team → Import roster** card. People added on the Team page or through access requests aren't affected. People listed without an email can't sign in until one is added.

## Workflow

1. **SD** fills the form (SPL, Task Name, Scene, Business Type, project), confirms every setup checklist item, and uploads either 5 images (EXO 1–4 + EGO) or one 30–60 s video. Status becomes **Pending QC Review** and QC is notified.
2. **QC** opens the ticket and it moves to **Reviewing**. QC ticks the visual checks, each tied to the project's guideline flags (FLAG 01–03 for EgoExo).
   - **Approve** (only when all checks pass) → **Approved**, SD notified that filming can begin.
   - **Request changes** → mandatory feedback, pre-filled with the guideline's Issue - Fix for each failed check (QC can edit it) → **Returned / Needs Fixes**, SD and assigned SPL notified.
3. **SD** fixes the setup and clicks **Resubmit** on the same ticket with new media. Previous rounds stay viewable.
4. Every action is recorded in the ticket's history log.

**Who sees what:** SDs see their own tickets, SPL/SPC see their studio's tickets plus metrics, and QC and the Admin Team see everything. QC reviewers and Admins can approve or return tickets (opening a ticket marks it Reviewing only for QC).

## Configuration

| Env var | Purpose |
| --- | --- |
| `ALLOWED_DOMAINS` | Email domains that sign in without approval (default `atlascapture.io`) |
| `GOOGLE_CLIENT_ID` | Optional OAuth Web client ID to also offer Google sign-in |
| `DEV_LOGIN` | `1` enables the no-password name picker (local development only) |
| `SITE_PASSWORD` | Shared password in front of the whole site (test deployments) |
| `PORT` | HTTP port (default 3000) |
| `DATA_DIR` | Local database and uploads folder (default `./data`) |
| `DATABASE_URL` / `NETLIFY_DATABASE_URL` | Postgres connection. Set automatically by Netlify DB; leave unset locally to use the embedded database |
| `SESSION_SECRET` | Signs sessions, codes and media links. Required online; auto-generated into `data/.secret` locally |
| `BOOTSTRAP_ADMINS` | Comma-separated emails that are always active admins (lets you sign in to a fresh online database) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email for sign-in codes and ticket notifications. Without it, codes are shown on screen (test mode) |
| `APP_URL` | Public base URL. Used for ticket links in emails; an `https` URL also marks the session cookie Secure |

You can add projects besides EgoExo in `src/projects.js`. The form checklist, media slots and QC checks are all generated from that file.

## Google Sheet log (one tab per country)

Every ticket is mirrored into the **QA/QC TICKETING_DB** spreadsheet: one row per ticket, updated on submit, review, return, resubmit and approve, in the tab for the studio's country (`country` on each studio in the roster: Philippines, Indonesia, …). The app's own database stays the source of truth; the sheet is for viewing, filtering and sharing.

1. In the spreadsheet: **Extensions → Apps Script**, paste `scripts/google-sheets-sync.gs`, and set `SECRET` to the site's `SHEETS_WEBHOOK_SECRET`.
2. **Deploy → New deployment → Web app**, Execute as *Me*, access *Anyone*. Copy the web app URL.
3. Set it as `SHEETS_WEBHOOK_URL` in the site's environment variables and redeploy.
4. To backfill existing tickets, an admin can call `POST /api/admin/sheets-resync`.

## Deploying (Netlify)

`netlify.toml` configures everything: `public/` is served from Netlify's CDN, `/api/*` runs in the `api` Netlify Function, and `/media/*` is streamed by an edge function from **Netlify Blobs**. Data lives in **Netlify DB** (Postgres).

1. **Connect the repo:** Netlify → Add new site → Import from GitHub → this repo. The build settings come from `netlify.toml`.
2. **Database:** enable **Netlify DB** for the site (it sets `NETLIFY_DATABASE_URL`). Netlify DB databases must be **claimed** into a Neon account within 7 days or they are deleted, so claim it from the site's database panel.
3. **Environment variables** (Site configuration → Environment variables): `SESSION_SECRET` (a long random string), `BOOTSTRAP_ADMINS` (your email), `APP_URL` (the site's https address), and optionally `SITE_PASSWORD`, `ALLOWED_DOMAINS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
4. **Deploy**, sign in with the bootstrap admin email, then on **Team → Import roster** upload `config/team.json` (made with `node scripts/export-roster.js`).

Uploads are sent in 4 MB parts to stay under Netlify's function request limit, and media links are signed and expire after 6 hours. Every push to `main` redeploys. Make sure `DEV_LOGIN` is not set online.
