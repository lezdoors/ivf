# Nina — IVF app setup

A private IVF companion for Ryan & Nina, built on top of the **Notion** workspace
"🌱 IVF Journey — Ryan & Nina". The web app is the phone-friendly UI; Notion is the
database; Mouha (the VPS) is the agent.

```
 phone / web (Vercel)  ──►  /api/*  ──►  Notion databases
        │                                    ▲
        └── ask the agent ──► Copilot Queue ─┘  ◄── Mouha worker (24/7)
```

## What you get
- **today** — cycle phase, key dates, auth-expiry countdown, next appointment, top risks
- **monitoring** — log each scan (E2, LH, P4, lining, follicles) right at the clinic
- **journal** — per-person private pages (yours vs Nina's) + a year "garden" that blooms each day; only "shared" entries cross over
- **appts / meds** — appointments and medications with insurance status
- **dr. sherpa** — ask questions or tell it to log things / send Slack (runs on Mouha)

## 1. Notion integration (2 min)
1. https://www.notion.so/my-integrations → **New integration** → name it "Nina App" → copy the **Internal Integration Token** (`secret_…`).
2. Open the **🌱 IVF Journey — Ryan & Nina** page in Notion → **•••** → **Connections** → add "Nina App". (Sharing the top page shares every database under it.)

## 2. Deploy to Vercel
```bash
cd ivf-combined
git init && git add -A && git commit -m "Nina IVF app"
# push to a NEW private repo (do NOT push to lezdoors/ivf — that's Rocco's original)
vercel                     # or import the repo at vercel.com
```
In Vercel → Project → **Settings → Environment Variables**, add:
| name | value |
|------|-------|
| `NOTION_TOKEN` | the `secret_…` token |
| `APP_PASSCODE` | a PIN you + Nina share |
| `SLACK_WEBHOOK_URL` | optional, for agent reminders |

Redeploy. Open the URL, enter the passcode.

## 3. Agent (Mouha)
See [`mouha/README.md`](mouha/README.md) — copy the worker to the VPS, set its
`.env` (same `NOTION_TOKEN` + your `OPENAI_API_KEY`), run as a systemd service.
Until it's running, every tab still works; only the **agent** tab waits.

## Local dev
```bash
pnpm install
vercel dev        # runs the /api functions locally; needs the same env vars in .env
```
(Plain `pnpm dev` runs the UI but the `/api` routes need `vercel dev`.)

## Privacy notes
- The Notion token never reaches the browser — all Notion calls go through `/api`, gated by `APP_PASSCODE`.
- Journal privacy (yours vs Nina's) is enforced in the app by the user switch. Since you share one passcode, it's a soft split, not hard security — fine for the two of you. For true separation, add per-user logins later.
- This handles real health data. Keep the passcode private and the repo private.
