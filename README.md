# Daemons.ai web

The root `index.html`, `site.css`, and `CNAME` remain the GitHub Pages marketing
site at https://daemons.ai. The login link opens the separate operational console
at https://app.daemons.ai, deployed on Fly in `daemons-console`.
The marketing page explains the shipped product and uses a labeled illustration
with fictional task data. Its preview makes no authenticated API calls.

The homepage leads with “Give your AI assistants a soul. Stay in control of their work.”
It defines a Daemon as a persistent home for a thread of responsibility and explains
continuity across assistants: ongoing responsibilities,
saved plans and decisions, and a shared work queue. Business follow-ups, a home
renovation, and a community event illustrate successive assignments rather than
one-off prompts. These are configurable examples, not built-in integrations or
automatic scheduling. The existing “Give your AI assistants a soul” artwork remains consistent with the
headline. Assistant independence means approved access and continuity of the work;
copy does not promise external-provider non-retention or deletion of data already received.

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

## Assistant check-in settings

Daemon → Settings → Execution offers 30 minutes, 2 hours (default), 8 hours,
or no automatic expiry. This limits silence between progress reports, not total
task duration. Changes affect new attempts. Active cards show the last check-in
and next deadline. Owners can request a cooperative stop or separately end a
stuck attempt; ending blocks further reports but does not stop external work.
Review any external effects before choosing Try task again.

Deploy the matching API migration and replace every old API instance before
releasing these controls. The service repository documents migration and rollback.

## Shared Daemons (private collaboration pilot)

When the API reports collaboration_enabled, the console shows a Personal/Org
workspace picker and Org administration under Manage workspaces. Teams are
optional. Daemon Settings → Shared responsibility manages roles, invitation
links, leads, and separate assistant approvals. Copy creates a clean unpublished
draft; Move to Org explicitly moves existing history and clears old approvals.

Invitations require sign-in, single-use acceptance, and inviter confirmation of
the accepting identity. The secret lives only in the link fragment and is removed
on acceptance-page load. Log in in a separate tab if necessary, then return to
the original invitation. The console does not send invitation email. Viewer
controls are read-only; Operator memory remains unconfirmed. Server-side role and
scope checks remain authoritative even if a control is manipulated locally.

Deploy the migration/API fully before this console. Collaboration defaults off;
the API's operations guide describes enabling and verifying a private pilot.

## Daemons Embed v1

The console also serves `/embed/v1`, a dedicated human-facing tasks/results panel,
and `/embed/component-v1.js`, a framework-independent Game component. Only the
embed page may be framed, and only by a registered Game's exact origin; the full
console and login retain framing protection. The Game installs a pinned local
copy of the component and the matching Ring adapter from daemons.ai/sdk/clojure.
The frame receives data through a fixed source/origin/nonce-bound message channel;
Game credentials and Intergraph tokens never enter it. It does not use third-party
cookies. Games supply reviewed, opt-in context through contextProvider.

`/connect-game?request=...` handles top-level consent, naming the requesting Game
and selected Daemons. `/game-connections` lists and revokes human Game approvals,
separately from assistant executor grants. All approval decisions are enforced
server-side by Daemons. These routes appear when the API reports embed_enabled.
See daemons.ai/docs/daemons-embed.md for registration, adapter installation,
permissions, limits, pilot rollout, and verification. No npm artifact is published.
