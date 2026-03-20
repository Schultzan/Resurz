# Resurz (Beläggning)

Månadsplanering för timmar – React + Vite, valfri persistens via **Supabase** (en JSON-rad per workspace).

## GitHub (första gången)

Lokalt finns redan `git` med en **initial commit** (`.env` ingår **inte**).

1. Installera [GitHub CLI](https://cli.github.com): `brew install gh`
2. Logga in (öppnar webbläsaren):  
   `gh auth login -h github.com -p https -w`
3. Från projektroten, skapa publikt repo **Resurz** och pusha:  
   `./scripts/push-to-github.sh`  
   (Om namnet `Resurz` redan finns på ditt konto, byt namn i skriptet eller skapa repot manuellt och kör `git remote add origin …` + `git push -u origin main`.)

## Lokal utveckling

```bash
npm install
cp .env.example .env   # fyll i Supabase-värden om du vill ha molnsync
npm run dev
```

Öppna den URL som Vite skriver ut (t.ex. `http://localhost:5173`).

## Deploy (t.ex. Vercel)

Rotfilen **`vercel.json`** sätter Vite-build: `npm run build` → **`dist/`**.

**Steg-för-steg (dashboard eller CLI):** se [docs/VERCEL_SETUP.md](docs/VERCEL_SETUP.md).

Kort: publicera repot → på Vercel lägg till miljövariabler → **Production**:

| Variabel | Beskrivning |
|----------|-------------|
| `VITE_SUPABASE_URL` | `https://….supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Publishable eller legacy **anon** (aldrig `service_role`) |
| `VITE_SUPABASE_WORKSPACE_ID` | Valfritt, standard `default` |

Efter ändring av env: **Redeploy** så Vite får in värdena i bygget.

Andra hostar: samma build/output + samma `VITE_*`.

## Supabase-databas

Kör SQL i [supabase/migrations/001_resurz_workspace.sql](supabase/migrations/001_resurz_workspace.sql) i Supabase SQL Editor (tabell `public.resurz_workspace` + RLS).

## Flera datorer

Alla som ska dela **samma planeringsdata** ska använda **samma** deployade app‑URL och **samma** Supabase‑projekt (+ samma `VITE_SUPABASE_WORKSPACE_ID` om du sätter den).  
`localhost` är bara för utveckling på en maskin.

## Script

- `npm run dev` – utvecklingsserver  
- `npm run build` – produktionsbygge  
- `npm run lint` – ESLint  
- `npm run preview` – förhandsgranska `dist/` lokalt  
