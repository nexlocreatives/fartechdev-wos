# FAR Tech — Operations Console

React + Supabase front end for the White Label Onboarding & Operations System.

## Local setup

```bash
npm install
cp .env.local.example .env.local
# edit .env.local with your Supabase Project URL + anon key
npm run dev
```

Open http://localhost:5173

## Deploying

See `DEPLOYMENT_GUIDE.md` (provided separately) for full step-by-step
Supabase + GitHub + Netlify deployment instructions.

**Never commit `.env.local`** — it's already excluded in `.gitignore`.
Only the `anon`/`publishable` Supabase key belongs in this project;
the `service_role`/`sb_secret_` key must only live inside Supabase Edge
Functions, never in this frontend codebase.

## Project structure

```
├── index.html
├── package.json
├── vite.config.js
├── netlify.toml           # Netlify build + SPA redirect config
├── public/
│   └── _redirects         # Netlify SPA fallback (belt & suspenders w/ netlify.toml)
├── src/
│   ├── main.jsx            # React entry point
│   ├── index.css
│   ├── App.jsx              # Main application (demo data — see // SUPABASE: comments)
│   └── lib/
│       └── supabaseClient.js
└── .env.local.example
```
