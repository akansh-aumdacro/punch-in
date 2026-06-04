# PunchIn

AI-powered Time & Attendance for contract and multi-site workforces. Built as a full-stack MERN application.

## Features

- Face / GPS / NFC / QR clock-in with real-time live dashboards
- Multi-site geofencing with Leaflet map
- Shift templates, scheduler (drag-drop), swaps, weekly off configs
- Timesheets with approval workflow, locking, and multi-format payroll export (CSV / XLSX / PDF / ADP / QuickBooks)
- Leave management — types, allocations, balances, sandwich policy, blackouts, coverage warnings
- Reports & Analytics — 10 report types, recharts visualizations, scheduled email delivery via nodemailer
- AI Time Guard — 8-detector anomaly engine with nightly cron + manual scan
- Role-specific dashboards (SuperAdmin / HR / Supervisor / Worker / Agency)
- Notifications (in-app + socket-pushed) with bell widget
- Public REST API (`/v1/*`) with API-key auth, scopes, and HMAC-signed webhooks
- Org / Policy / Integration / API-key settings pages

## Stack

- **Frontend** — React 18 + Vite + Tailwind + react-query + recharts + react-leaflet + @dnd-kit + socket.io-client
- **Backend** — Node 20 + Express + Mongoose + Socket.IO + ioredis + node-cron + nodemailer + exceljs + pdfkit
- **Infra** — MongoDB 7, Redis 7, nginx (client), Docker Compose

## Quick start with Docker

### Prerequisites

- Docker Desktop / Docker Engine 20+
- Docker Compose v2 (`docker compose ...`)

### 1. Clone & configure

```bash
git clone <repo> punchin
cd punchin
cp .env.example .env
# Edit .env — set JWT_SECRET, optional SMTP_*, etc.
```

### 2. Boot the stack

```bash
docker compose up --build
```

That starts MongoDB, Redis, the server, and the nginx-fronted client. Open <http://localhost> in your browser.

### 3. Seed demo data (optional)

```bash
docker compose exec server node src/scripts/seed.js
```

This creates:

- 1 organization (**PunchIn Demo**)
- Users: 1 superadmin, 1 HR, 2 supervisors, 10 workers (mixed permanent / contract)
- 3 sites with geofences (Bangalore, Mumbai, Pune)
- 3 shift templates (Morning, Evening, Night)
- 3 leave types with allocated balances
- 30 days of attendance logs per worker
- Last-week timesheets

**Default admin credentials** (printed at the end of the seed run):

```
Email:    admin@truein.demo
Password: admin1234
```

> ⚠️ Change the password immediately after first login in any non-demo environment.

## Running locally without Docker

```bash
# 1. Start Mongo + Redis any way you like (brew, port, container, etc.)

# 2. Server
cd server
cp ../.env.example .env       # or copy from root .env
# edit MONGODB_URI / REDIS_URL if needed
npm install
npm run dev                   # starts on :5000

# 3. Client (in a separate terminal)
cd client
npm install
npm run dev                   # starts on :5173, proxies /api to :5000
```

## Environment variables

Copy `.env.example` to `.env` and adjust:

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | `development` | `production` for compose |
| `PORT` | `5000` | Server port |
| `MONGODB_URI` | `mongodb://localhost:27017/truein` | Compose sets `mongodb://mongo:27017/truein` |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Compose sets `redis://redis:6379` |
| `JWT_SECRET` | _required_ | Min 32 chars, random in prod |
| `JWT_REFRESH_SECRET` | _required_ | Separate from `JWT_SECRET` |
| `CLIENT_URL` | `http://localhost:5173` | CORS allowlist |
| `SMTP_HOST` | _optional_ | If unset, scheduled reports queue but don't send |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` / `SMTP_PASS` | _optional_ | |
| `SMTP_FROM` | `Truein <no-reply@truein.app>` | |
| `CLOUDINARY_*` | _optional_ | Wired but not enforced yet — local disk uploads work |
| `GOOGLE_MAPS_API_KEY` | _optional_ | Enables server-side geocoding; client uses OSM tiles regardless |
| `FACE_MATCH_THRESHOLD` | `0.6` | AI Time Guard flags scores below this |

## Project layout

```
punchin/
├── client/                React + Vite + Tailwind
│   ├── src/
│   │   ├── api/           axios + per-module clients
│   │   ├── components/    Sidebar, AppLayout, AnomalyBadge, dashboard widgets
│   │   ├── context/       AuthContext, AttendanceContext
│   │   ├── hooks/         useGeolocation, useOfflineQueue
│   │   ├── pages/         attendance, workers, sites, shifts, timesheets,
│   │   │                  leaves, reports, ai, dashboard, settings, auth
│   │   └── main.jsx
│   ├── Dockerfile         multi-stage build → nginx
│   └── nginx.conf         SPA + /api + /v1 + /socket.io proxy
├── server/                Express + Mongoose
│   ├── src/
│   │   ├── config/        db, redis, socket, cloudinary
│   │   ├── controllers/   one per module
│   │   ├── middleware/    auth, roleCheck, apiKeyAuth, upload, errorHandler
│   │   ├── models/        Mongoose schemas (multi-tenant, soft-delete)
│   │   ├── routes/        auth, workers, sites, attendance, shifts,
│   │   │                  timesheets, leaves, reports, ai, notifications,
│   │   │                  settings, v1, audit
│   │   ├── services/      attendance, timesheet, leave, ai (8 detectors),
│   │   │                  report (10 reports + exporters), notification,
│   │   │                  webhook, scheduler crons
│   │   ├── scripts/       seed.js
│   │   └── app.js
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## Public API (`/v1`)

Authenticate with an API key generated in **Settings → API Keys** (superadmin only):

```bash
curl http://localhost/v1/workers \
  -H "x-api-key: tk_xxxx_yyyy..."
```

Available endpoints:

| Method | Path | Scope |
|--------|------|-------|
| `GET` | `/v1/workers` | `workers:read` |
| `POST` | `/v1/workers` | `workers:write` |
| `GET` | `/v1/attendance` | `attendance:read` |
| `GET` | `/v1/timesheets` | `timesheets:read` |
| `POST` | `/v1/webhooks` | `webhooks:write` |
| `GET` | `/v1/webhooks` | `webhooks:write` |
| `DELETE` | `/v1/webhooks/:id` | `webhooks:write` |

### Webhooks

Register a URL to receive POST callbacks for `clock_in`, `clock_out`, `leave_approved`. Each delivery includes:

- Header `X-PunchIn-Signature: sha256=<hex>` — HMAC over the raw body using the secret returned at webhook creation time.
- Header `X-PunchIn-Webhook-Id: <webhook-id>`.

Verify the signature server-side before trusting the payload.

## Final command

```bash
cd punchin && docker compose up --build
```

Then visit <http://localhost>, log in as `admin@truein.demo / admin1234` after seeding, or register a fresh organization at `/register`.
