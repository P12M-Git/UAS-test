# Driver Performance deployment (Render / Node)

## Diagnosis: confirmed versus unverified

The repository-root `app/page.tsx` contains the CURRENT **ELMS · DRIVER
PERFORMANCE REPORT**, with Race Analysis, Overview, Driver Performance, Lap
Analysis, Traffic Performance, Season Summary, Category Benchmarks and Data /
Session Info. The local baseline production check rendered those sections after
login: the gateway log saying “UAS Driver Insider · protected access” did **not**
mean it had selected another frontend. The login page itself was separate HTML
in `server/auth.mjs` and still used that name.

Confirmed deployment ambiguities/failures before this fix:

- A second, older app is committed under `Driver_Performance/`, with its own
  package, app and configuration. Its scripts could launch the older version
  if Render's Root Directory pointed there. That copy lacks the current default
  race loader, login and latest traffic changes. It is retained as an archive;
  its launch/build scripts now fail with an instruction to use the root.
- `npm start` ran `server/start.mjs`, which launched `vinext start` relative to
  the working directory. Vinext serves `dist/server/index.js` and `dist/client`,
  NOT live source files and NOT `.next`. No check tied that output to the source.
- The Vite config always enabled a Cloudflare Worker build, although Render
  starts a Node service. Production now explicitly selects Vinext's Node build.
- The login gateway could return HTTP 200 while the underlying UI was not ready.
  There was no Render blueprint or app-readiness endpoint in the repo.
- Local Windows production testing reproduced 404s for existing nested JS
  assets: Vinext 0.0.50's static cache keys use Windows backslashes. The gateway
  now serves only verified `dist/client` files, behind the same authentication,
  on both Windows and Linux. This Windows finding is not proof of a Render bug.

The GitHub URL was not readable anonymously (404). The local checkout was clean
at `a88b151`, matching its local `origin/main` reference. That reference is not a
live check of GitHub. No Render account/logs/settings were available, so its
actual deployed commit, root directory, last build outcome and cache state
cannot be established here. Check those settings before attributing the live
incident to one specific cause. Render keeps the previous successful deployment
when a replacement fails; **Restart service** does not deploy newer source.

## Commands

- `npm run dev`: authenticated local development using the ROOT app, with HMR.
  Reads ignored `.env.local`. No production build required.
- `npm run build`: clears only generated root `dist/` and `.next/`, builds the
  current root app for Node, then records source/output fingerprints and the
  Render commit in `dist/build-info.json`. Failed builds get no valid marker.
- `npm start`: authentication gateway pinned to the repository root; verifies
  the production build, then starts Vinext on a private loopback port. Refuses
  missing, changed or stale artifacts. Does not build or fall back to old output.
- `npm test`: analysis/parser/auth/build-integrity regression tests.
- `npm run test:production`: starts the exact production launcher target using
  isolated test credentials, checks the real report, JS, four private CSVs,
  readiness/build ID, login and logout. Run after `npm run build`.

## Exact Render settings

Use a **Node Web Service**, not a Static Site. `render.yaml` describes this setup.
For an existing dashboard-created service, apply these settings there manually;
adding YAML alone does not change an existing service's configuration.

- Repository: `P12M-Git/UAS-test`; branch: the branch containing this fix.
- **Root Directory: blank (repository root), NOT `Driver_Performance`.**
- **Build Command: `npm ci --include=dev && npm run build`**
- **Start Command: `npm start`**
- **Health Check Path: `/healthz`**
- Node: 22 (at least 22.13). The blueprint selects the latest Node 22 release.
- One instance: the basic login sessions/rate limit are in memory. Restarting
  logs users out. This is not a distributed multiuser authentication service.

`npm install --include=dev && npm run build` also works, but `npm ci` is preferred
because it uses the committed lockfile. Include dev dependencies: Vinext/Vite
are currently declared there and are required for build/start.

### Required private environment variables

| Variable | Value |
| --- | --- |
| `AUTH_USERNAME` | Your configured username, e.g. `Pol` |
| `AUTH_PASSWORD_HASH` | Existing scrypt `salt:hash` value from local `.env.local`; transfer privately into Render, never commit it |
| `APP_ORIGIN` | Exact HTTPS origin, e.g. `https://your-service.onrender.com`, with no trailing slash |
| `NODE_ENV` | `production` |

Render provides `PORT` and `RENDER_GIT_COMMIT`. `NODE_VERSION=22` is in the
blueprint. Production does not load `.env.local`; no password defaults are
embedded. Secure/HttpOnly/SameSite cookies, origin checks and login throttling
remain enabled. Expose only the gateway PORT, not the internal Vinext port.

## Source, generated files and caching

- `build/sites-vite-plugin.ts` is REQUIRED SOURCE for the existing Sites/local
  integration. It was inspected and retained, not deleted or ignored.
- `dist/`, `.next/`, `.vinext/`, `.wrangler/` and `node_modules/` are generated
  and ignored at every depth. No tracked `dist/` or `.next/` files were found;
  root `.next/` did not exist. Only the archived `tsconfig.tsbuildinfo` was
  tracked generated state: it is now untracked (local file retained).
- The root app never imports the archived frontend. Its source is not removed.
- Responses remain `Cache-Control: no-store`; no app service worker was found.
  Build IDs appear in startup logs, `X-App-Build` and `/healthz`. The latter also
  shows the Render commit and returns 503 if the actual report cannot render.
- The bundled four races/logo remain included. Upload and analysis code is
  unchanged. User-uploaded files are still browser-local, not shared persistence.

After committing/pushing this fix and correcting the settings, use **Clear build
cache & deploy once**. This avoids reusing artifacts from the previous build
configuration. Then verify `/healthz` shows the expected commit/build, log in,
and check the eight-section sidebar. Do not merely restart the previous deploy.

## Changed files

- `package.json`: fresh-build wrapper and production smoke-test command.
- `vite.config.ts`: explicit Node production path; preserves local Sites setup.
- `server/build.mjs`: clean build and successful-build marker.
- `server/production-build.mjs`: root resolution and source/artifact verification.
- `server/start.mjs`: fixed root, verified build, private build assets, readiness,
  build identification, production-only environment settings and child failures.
- `server/auth.mjs`: removes old login branding; credential checks unchanged.
- `app/layout.tsx`, `app/page.tsx`: title/brand text only; report layout unchanged.
- `render.yaml`: explicit Render commands, root, health check and variable names.
- `.gitignore`: nested outputs and TypeScript build caches ignored.
- `Driver_Performance/package.json`, `server/legacy-root.mjs`: prevent accidental
  deployment of the archived app, without removing its source.
- `Driver_Performance/tsconfig.tsbuildinfo`: removed from Git tracking only.
- `tests/production.test.mjs`: authenticated production report/assets/data test.
- `tests/production-build.test.ts`: missing/stale/tampered output tests.
- `LOGIN.md`, `README.md`, `DEPLOYMENT.md`: align usage and deployment instructions.

References: [Render deployment lifecycle and cache clearing](https://render.com/docs/deploys),
[Render Node versions](https://render.com/docs/node-version).
