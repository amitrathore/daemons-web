# Daemons.ai web

The root `index.html`, `site.css`, and `CNAME` remain the GitHub Pages marketing
site at https://daemons.ai. The login link opens the separate operational console
at https://app.daemons.ai, deployed on Fly in `daemons-console`.
The marketing page explains the shipped product and uses a labeled illustration
with fictional task data. Its preview makes no authenticated API calls.

The homepage leads with “One place to organize ongoing work across your AI tools.”
A Daemon is explained as a workspace holding instructions, saved decisions, tasks,
and results while connected assistants and agents execute work externally.
Assistants, agents, chatbots, and copilots are introduced once as categories of
compatible AI tools; the copy does not promise universal compatibility.

A simplified renovation preview leads into a three-part example: compare quotes,
save a decision, and retrieve it in a later conversation to assess a revised quote.
This is illustrative work using user-provided documents, not a built-in integration.
Setup covers creating a Daemon (including publishing instructions), connecting a
compatible tool, and assigning a task. Visible setup notes explain active pickup,
external execution, and explicit saving/retrieval of context. Repeated capability
sections are consolidated into saved context, shared assignments, and access.
The existing mascot remains decorative; social metadata uses the mascot asset
without the old headline. Existing console behavior and APIs are unchanged.

Preview the public homepage separately from the console:

```sh
STATIC_ROOT=. PORT=8097 npm start
```

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

## Brand and appearance

The public site and console share `brand.css` and `theme.js`. First visits use
Light; the footer offers Light, Dark, and System. A one-year, non-sensitive
`daemons_appearance` preference cookie is shared across production subdomains
(Secure, SameSite=Lax). Local previews use localStorage. Storage failures retain
a usable light default and allow a temporary choice. Theme setup runs before
styles load and uses only same-origin scripts, styles, fonts, and images.

The console build copies the shared theme, licensed Manrope font, and brand
assets. Character artwork is decorative and does not indicate execution status.
See `docs/brand-assets.md` for generated-art prompts and source asset details.

## Public legal and support pages

The shared footer links to `/terms/`, `/privacy/`, and `/contact/`, served as
static directory pages by GitHub Pages. They name Daemons LLP and
hello@daemons.ai, as confirmed by the operator. Policy structure was adapted
from Yvatar’s local legal source, with Daemons-specific account, memory, task,
assistant-access, archival-history, and theme-cookie disclosures. No payment,
social-publishing, or AI-generation claims were carried over.

The console links to the public policies; changing its footer does not add an
acceptance gate or alter authentication. Update the policy revision date when
changing substantive policy text. `footer.css` is shared by all public pages and
the console, and is copied into the console build.
