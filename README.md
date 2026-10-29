# Daemons.ai web

The root `index.html`, `site.css`, and `CNAME` remain the GitHub Pages marketing
site at https://daemons.ai. The login link opens the separate operational console
at https://app.daemons.ai, deployed on Fly in `daemons-console`.
The marketing page explains the shipped product and uses a labeled illustration
with fictional task data. Its preview makes no authenticated API calls.

The vanilla JavaScript console lives in `app/`. It uses the Clojure control API at
https://api.daemons.ai for Intergraph login, Daemon definitions/versioning, work,
activity, OAuth consent, and assistant access revocation. No credentials belong
in this repository or frontend configuration. The server sets security headers
and serves the application shell for console routes.

## Develop and verify

Node 22+:

```sh
npm ci
npx playwright install chromium
npm test
npm run build
npm start
```

The console runs on port 8096. Build-time `PUBLIC_API_URL` is a public HTTP origin;
production defaults to https://api.daemons.ai. Browser tests use API fixtures and
cover logged-out return destinations, create/publish/work/results/logout, owner
consent, escaped content, and mobile overflow. The backend repository provides
real HTTP/PostgreSQL/OAuth/MCP integration tests and operations documentation.

## Deploy

```sh
fly deploy --config fly.app.toml --remote-only --ha=false
```

`Dockerfile.app` builds static assets and runs a non-root Node static server.
Pushing root changes separately updates GitHub Pages. The existing `CNAME` stays
`daemons.ai`; console deployment does not repoint the marketing domain.
