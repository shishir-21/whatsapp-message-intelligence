# WhatsApp Message Intelligence

Monitors one selected WhatsApp group, classifies each incoming message with AI (Groq), extracts useful fields, and provides a human review workflow for uncertain or important results, plus a searchable message history.

## Architecture

| Part | Tech | Port |
|------|------|------|
| `backend/` | Node.js, Express 5, TypeScript, Prisma 7 (PostgreSQL), WPPConnect + Puppeteer, Groq SDK | 5000 |
| `frontend/` | Next.js 16, React 19, Tailwind 4 | 3000 |
| Database | PostgreSQL 16 via `docker-compose.yml` | 5435 (host) |

WPPConnect drives a headless Chromium running WhatsApp Web; the backend receives group messages, stores them, sends text to Groq for classification, and routes low-confidence / HIGH priority / INCIDENT results to the review queue.

## Features

- Connect WhatsApp from the UI by scanning a QR code
- Select which WhatsApp group to monitor (messages are scoped to that group)
- AI classification, priority and extraction per message (Groq)
- Human review queue with corrections
- Message history with status and category filters

## Prerequisites

- Node.js 20+ (developed on 24) and npm
- Docker Desktop (for PostgreSQL)
- Git
- Internet access on first install (npm downloads a Chromium build for Puppeteer, ~150 MB)
- **Your own** Groq API key (free at https://console.groq.com/keys)
- **Your own** WhatsApp account on a phone (to scan the QR)

Nothing from the author's machine is needed: no WhatsApp session, tokens, database, `.env` file or API key.

## Setup (Windows PowerShell; identical on macOS/Linux except copy commands)

```powershell
git clone <repo-url>
cd whatsapp-message-intelligence

# 1. Environment files
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env.local
```

Edit `backend\.env` and set `GROQ_API_KEY` to your own key (and `GROQ_MODEL` if you want another model). Everything else works with the defaults.

```powershell
# 2. Install dependencies (backend downloads Chromium here)
npm run install:all

# 3. Start PostgreSQL (fresh, empty database)
npm run db:up

# 4. Generate the Prisma client and apply migrations
npm run db:generate
npm run db:migrate
```

Without the root scripts, the equivalents are `cd backend && npm install && npx prisma generate && npx prisma migrate deploy` and `cd frontend && npm install`. `backend/.env` must exist before running Prisma commands, since `prisma.config.ts` reads `DATABASE_URL`.

### Run (two terminals, from the repository root)

```powershell
npm run backend     # terminal 1 -> http://localhost:5000
npm run frontend    # terminal 2 -> http://localhost:3000
```

### Use the app

1. Open http://localhost:3000.
2. Click **Connect WhatsApp**. The first launch has no session, so the status is `QR_REQUIRED` and a QR code appears (also printed in the backend terminal in development).
3. On your phone: WhatsApp > Linked devices > Link a device, and scan the QR.
4. Select a WhatsApp group to monitor.
5. New messages in that group appear in **Messages** and, when flagged, in **Reviews**.

## Environment variables

`backend/.env` (template: `backend/.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | Default matches `docker-compose.yml` (`whatsapp_user` / `whatsapp_password`, db `whatsapp_intelligence`, port 5435) |
| `GROQ_API_KEY` | yes | Your own Groq API key |
| `GROQ_MODEL` | yes | Groq chat model id (default `llama-3.3-70b-versatile`) |
| `AI_REVIEW_CONFIDENCE_THRESHOLD` | yes | 0-1; below this confidence a message is held for review |


`frontend/.env.local` (template: `frontend/.env.example`): `NEXT_PUBLIC_API_URL=http://localhost:5000` (backend base URL, no `/api`). The backend allows CORS only from `http://localhost:3000`, so open the frontend on that exact origin.

## Tests and checks
Backend
```powershell
cd backend  
npm test 
npm run build
```

Frontend
```powershell
cd ../frontend 
npx tsc --noEmit
npm run lint
npm run build
```

## Security notes

- **WhatsApp session data is stored locally and is intentionally not committed to Git.** It lives in `WHATSAPP_SESSION_PATH` (default `backend/tokens/`, including the Chromium profile), which is git-ignored along with `.env`, `.env.local`, and other session directories. On first run you must scan **your own** QR code.
- Never commit `.env` or your Groq key. Anyone with the session directory can access the linked WhatsApp account; delete it (or use **Logout** in the app) to unlink.
- Message text is sent to Groq for classification.

## Known limitations

- Depends on WhatsApp Web through WPPConnect (unofficial); WhatsApp changes can break it. The project launches its own Puppeteer browser to avoid WPPConnect's stealth user-agent override, which breaks current WhatsApp Web. Do not remove this.
- Only text and image captions are analysed; only group messages from other people are processed; one group is monitored at a time.
- **Clone into a short path** (e.g. `C:\src\whatsapp-message-intelligence`). Chromium's profile lives under `backend/tokens/`, and on Windows very long paths (over ~260 characters) make WhatsApp startup fail with `browserClose` and no QR.
- Port 5435 (Postgres), 5000 and 3000 must be free.
- If Chromium fails to launch (corporate proxies, Linux missing system libraries), run `npx puppeteer browsers install chrome` in `backend/`; on Linux install Chrome's shared library dependencies.
- If a previous backend run was killed, a stale Chromium may lock the session profile; end leftover `chrome` processes and retry.
