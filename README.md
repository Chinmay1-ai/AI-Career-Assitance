# AI-Based Career Assistant

Foundation for an AI career assistant with real-time interview performance analysis (features added in later steps).

## Stack

| Layer        | Technology              |
| ------------ | ----------------------- |
| Frontend     | React, Vite, JavaScript |
| Backend      | Node.js, Express        |
| Database     | PostgreSQL, Prisma      |
| Auth (prep)  | Clerk (`@clerk/react`)  |
| AI (backend) | Google Gemini API       |

## Project layout

```
AI-Career-Assistant/
  frontend/     React app (Vite)
  backend/      Express API + Prisma
  emotion-service/ Private local Flask/OpenCV expression detector
  .env.example  Template for all environment variables
```

## Prerequisites

- Node.js 20+ (tested with Node 22)
- PostgreSQL installed and running (needed when you connect Prisma to a real database)
- A [Clerk](https://clerk.com/) application (when you enable sign-in)

## Setup

1. **Environment variables**

   - Copy `.env.example` to `backend/.env` and fill in `DATABASE_URL`, `CLERK_SECRET_KEY`, and `GEMINI_API_KEY` (Gemini key stays on the server only).
   - Copy the `VITE_*` lines to `frontend/.env.local` and set `VITE_CLERK_PUBLISHABLE_KEY` when you enable Clerk.

2. **Install dependencies**

   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

3. **Prisma (optional until PostgreSQL is ready)**

   ```bash
   cd backend
   npm run db:generate
   # When DATABASE_URL is set:
   # npm run db:push
   ```

4. **Optional facial-expression service**

   Install its Python dependencies and run the local service when testing opted-in expression detection:

   ```powershell
   cd emotion-service
   python -m pip install -r requirements.txt
   python api_server.py
   ```

   The service binds to `127.0.0.1:5001` by default. Set `EMOTION_SERVICE_URL` in `backend/.env` only if it runs elsewhere. Submitted JPEG frames are analyzed temporarily and are not stored.

## Run locally

**Terminal 1 — API**

```bash
cd backend
npm run dev
```

Health check: [http://localhost:5000/api/health](http://localhost:5000/api/health)

Gemini configured check: [http://localhost:5000/api/gemini/status](http://localhost:5000/api/gemini/status)

Development Gemini smoke test (local only):

```bash
curl -X POST http://localhost:5000/api/gemini/dev-test -H "Content-Type: application/json" -d "{}"
```

**Terminal 2 — Frontend**

```bash
cd frontend
npm run dev
```

Open the URL Vite prints (usually [http://localhost:5173](http://localhost:5173)).

During development, the frontend proxies `/api` to the backend (see `frontend/vite.config.js`).

**Terminal 3 — Optional expression detector**

Start `emotion-service/api_server.py` as shown above. Interview answering and completion remain available when the service is stopped.

## Current scope

- Clerk-authenticated resume upload, structured analysis, and career recommendations
- Versioned skill gap analysis for a selected recommended role, persisted with the resume
- PostgreSQL storage through Prisma and Gemini-backed generation on the backend
- Gemini-generated or local-fallback mock interview questions, saved answers, and completion
- Browser speech recognition/text-to-speech and optional webcam/microphone preview
- Opt-in facial-expression detection with transient JPEG frames and structured observations only; raw frames are not stored
- Landing page and dashboard foundation

Mock interview endpoints (all require the existing Clerk bearer-token authentication):

- `GET /api/interviews/options` — supported roles, technologies, difficulties, and question-count limits
- `GET /api/interviews` — current user's interview sessions
- `POST /api/interviews` — create a session from `selectedRole`, `technology`, `difficulty`, and optional `questionCount`
- `GET /api/interviews/:sessionId` and `GET /api/interviews/:sessionId/questions` — load an owned session and its question snapshots
- `POST /api/interviews/:sessionId/answers` — save a transcript using `questionIndex` and `transcriptAnswer`
- `POST /api/interviews/:sessionId/emotions` — analyze an opted-in transient JPEG frame and save a validated observation
- `POST /api/interviews/:sessionId/complete` — complete an owned session
- `GET /api/interviews/:sessionId/results` — retrieve saved answers and reference answers; no automated evaluation is generated yet

Automated answer evaluation/performance reports are not implemented in this phase.

## License

Private / educational use unless you add a license file.
