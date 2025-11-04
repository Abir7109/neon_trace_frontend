# Neon Trace — Client

- Dev: `npm install && npm run dev`
- Build: `npm run build` → outputs to `dist/`

Config:
- Dev API: set `VITE_API_BASE` in `.env` (e.g., `http://localhost:3001`).
- Production API: add `.env.production` with `VITE_API_BASE=https://your-render-api-url`.

Deploy to GitHub Pages: workflow is in `.github/workflows/pages.yml` and runs on pushes to `main`.
