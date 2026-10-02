# 🚀 90th Minute — Complete Setup Guide

A step-by-step walkthrough to get the **90th Minute** real-time multiplayer football VAR room running locally on your machine.

---

## 📋 1. Prerequisites

Make sure you have the following installed:

- **Node.js**: `v20.0.0` or newer ([Download Node.js](https://nodejs.org/))
- **npm** (comes with Node) or **pnpm**
- **Git**
- A **Cloudflare Account** (Free tier is sufficient for testing Workers & Workers AI).

To verify your Node and npm versions:
```bash
node -v
npm -v
```

---

## 🛠️ 2. Step-by-Step Installation

### Step 2.1: Clone & Navigate to Project
If you haven't already:
```bash
git clone <repository-url>
cd cloudflare_task
```

### Step 2.2: Install Dependencies (From Project Root)
This repository is configured as a **pnpm monorepo workspace** (`pnpm-workspace.yaml`).

> [!IMPORTANT]
> **Always run package commands from the project root** (`cloudflare_task`), not from inside `client/` or `server/`. Running `npm i` inside `client` will fail with `Unsupported URL Type "workspace:"`.

Run from the root directory:
```powershell
pnpm install
```
*(If you do not have pnpm installed globally: `npm install -g pnpm`)*

---

## ⚙️ 3. Environment Configuration

The project requires two local environment configuration files:
1. `client/.env.local` (Tells the frontend where the Worker backend is running)
2. `server/.dev.vars` (Local environment variables and secrets for Wrangler)

### Option A: Using Windows PowerShell
Run the following commands from the project root (`cloudflare_task`):

```powershell
Copy-Item .env.example client/.env.local
Copy-Item .env.example server/.dev.vars
```

### Option B: Using Bash / macOS / Linux
```bash
cp .env.example client/.env.local
cp .env.example server/.dev.vars
```

### What these files contain:
- **`client/.env.local`**:
  ```ini
  VITE_API_BASE_URL=http://localhost:8787
  ```
- **`server/.dev.vars`**:
  ```ini
  # Optional: MongoDB for cross-session match logs.
  # Leave empty if you don't have MongoDB Atlas; the app will safely
  # degrade and use SQLite Durable Object storage instead!
  MONGODB_URI=
  MONGODB_DATABASE=90th_minute
  ```

---

## ☁️ 4. Cloudflare Authentication (Workers AI)

The backend uses **Cloudflare Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) for the live tactical analyst. 

To allow your local Wrangler development server to connect to Cloudflare AI bindings:

```powershell
pnpm -C server wrangler login
```
*(A browser window will open asking you to authorize Wrangler with your free Cloudflare account).*

> **Note**: Even if you don't log in right away, the match simulation, real-time score, chat, predictions, and WebSockets will still work completely via local Durable Object simulation. Only the AI tactical analyst requires Cloudflare connectivity.

---

## ▶️ 5. Run the Application
From the project root (`cloudflare_task`):

```powershell
pnpm run dev
```
*(or `npm run dev`)*

This launches:
- **Server (Cloudflare Worker)**: `http://localhost:8787` (handles REST APIs, Durable Objects, and WebSockets)
- **Client (React + Vite UI)**: `http://localhost:5173` (football war-room web interface)

---

## 🌐 6. Verify and Test

1. Open your browser and navigate to:
   ```text
   http://localhost:5173
   ```
2. **Test Real-Time WebSockets**:
   - Open a second browser window or an Incognito tab to `http://localhost:5173`.
   - Enter different display names in each tab (e.g., "Zidane" and "Iniesta").
   - Notice the **connected user count (presence)** increments immediately.
   - Send a message in the chat box; both windows receive it instantly over WebSockets.
3. **Test Simulation**:
   - Click the **"Simulate 5 Minutes"** button.
   - Watch the score, minute, and match timeline update simultaneously in both windows.
4. **Test AI Tactical Analyst**:
   - In the analyst query box, ask:
     > *"Who has momentum right now and what adjustments should Barcelona make?"*
   - Workers AI inspects authoritative room data and broadcasts the tactical summary.

---

## 🧪 7. Running Tests & Quality Checks

Run the automated test suite and TypeScript type checks:

```bash
# Run simulator unit tests
npm run test

# Run TypeScript checks across client and server
npm run typecheck

# Test production builds
npm run build
```

---

## 🔍 8. Troubleshooting & Common Pitfalls

| Issue | Cause | Fix |
|---|---|---|
| **`Port 8787 in use`** | Another Wrangler instance or process is using port 8787. | Kill the existing process: <br>• Windows: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8787).OwningProcess -Force`<br>• Or pass a different port in `server/package.json`. |
| **`WebSocket connection failed`** | Frontend cannot find the backend. | Verify `client/.env.local` contains `VITE_API_BASE_URL=http://localhost:8787` and restart `npm run dev`. |
| **`AI analyst unavailable`** | Wrangler is not authenticated to Cloudflare or offline. | Run `npx wrangler login` in your terminal. Live match state and chat remain functional even without AI. |
| **PowerShell script execution disabled** | Windows security policy blocks `npm`. | Run in PowerShell as Administrator: <br>`Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |

