# Deploy Resurz on Vercel (simple checklist)

Your **public URL** comes from Vercel. **Supabase** must have the same env values so saves work in production.

## Option A — Vercel website (no terminal)

1. Go to [vercel.com](https://vercel.com) and sign in.
2. **Add New → Project** and **import** this repo from GitHub (push the code first if needed).
3. Vercel should detect **Vite**: build `npm run build`, output `dist` (see root `vercel.json`).
4. Before or after the first deploy, open **Project → Settings → Environment Variables** and add (for **Production**):

   | Name | Value |
   |------|--------|
   | `VITE_SUPABASE_URL` | Your Supabase project URL (`https://….supabase.co`) |
   | `VITE_SUPABASE_ANON_KEY` | **Anon** or **publishable** key (not `service_role`) |

5. **Redeploy** (Deployments → … → Redeploy) so the new variables are baked into the build.
6. Open the **Production** URL Vercel shows (e.g. `https://….vercel.app`).

## Option B — Vercel CLI (from project folder)

1. In a terminal: `npx vercel login` and complete the browser/device login.
2. From the Resurz root: `npx vercel` (preview) or **`npm run deploy`** / `npx vercel --prod --yes` (production — lokal `build` först, sedan upload).
3. In the Vercel dashboard, add the same **Environment Variables** as in Option A, then redeploy.

## Cursor “Vercel MCP”

The MCP can list teams/projects but **does not replace login or push env vars**. You still complete deploy and env in the dashboard or CLI.

## After deploy

- Bookmark the **`.vercel.app`** URL — that is what you use from any computer.
- If the app says **offline** for cloud sync, the `VITE_*` vars are missing or the project was not redeployed after adding them.
