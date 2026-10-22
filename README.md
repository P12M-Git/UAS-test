# ELMS Driver Performance

## New workspace

Use **ABRIR NUEVA WEB** to open the new Overview and Driver Performance views.
The shared **Load races** dropdown selects races by championship and season.
The entire library loads in the background in both workspaces; selected races
receive priority and changing the selection or section does not cancel the queue.
Click a ready
race chip to activate it for Driver Performance. Selections stay in place when
switching sections. Overview is a website-wide summary of the complete race
catalogue and annual driver database: races, calendar years, driver categories
and distinct drivers (using known identity aliases). Selecting races does not
change these totals. Unknown categories are omitted from the driver category
selector; no category is invented for an unrated driver.
The workspace provides larger Calibri text and a light/dark theme switch;
the theme preference is saved in the browser.

## Alkamel race loading

Class Z compares selected clean laps against all clean laps of other drivers in
the same race/session and vehicle class, irrespective of FIA driver rating.
LMP2 Pro-Am shares the LMP2 reference; GT3/LMGT3/GTD vehicle labels share the GT3
reference. Driver identity aliases are excluded from their own reference.

Clean Air uses common-clock crossings at lap start, S1, S2 and the finish line.
A gap strictly below 2 seconds at any checkpoint marks the lap as traffic.
Reversed crossing order between consecutive sector loops also marks a passing
encounter, even when the checkpoint gaps themselves exceed 2 seconds. This
includes lapped cars and other classes; lap numbers do not need to match.
Pit-lane transitions do not constitute passing evidence. Missing sector/clock
coverage is unknown unless another checkpoint or pass confirms traffic.
The percentage uses all clean laps with known classification, independently of
Top 10/20, and sector gaps, encountered cars and reasons are retained per lap.
Sector observations cannot establish an unobserved sub-2-second approach between
loops without an order change. Shared cache data version 2 refreshes old parses.

On entry, the app reads the official ELMS, FIA WEC, Asian Le Mans Series, and
IMSA WeatherTech SportsCar Championship
Alkamel results indexes from 2022 onward and discovers each race's final
`23_Analysis_Race*.CSV` (or IMSA `23_Time Cards_Race*.CSV`). A verified catalogue of historical links fills gaps
when Alkamel's session-based index returns an incomplete event tree. A same-origin
server route retrieves each CSV, processes the lap data and stores the result.
Processed races are stored on the server's persistent disk and reused across
users, browsers and computers. IndexedDB is an additional browser cache. On later
visits, the app downloads only newly discovered races or races whose final CSV
path changed. A change to the driver categories CSV or parser cache version
refreshes the affected cache. The Render service needs a persistent disk mounted
at `/var/data` and `RACE_CACHE_DIR=/var/data/races`; see `render.yaml`. An
existing dashboard-created Render service must have its disk and environment
variable configured there too. Without that setting races still load using a
temporary server cache, and the tracker explains that persistence is not configured.
The **Alkamel** counter and **Database → Data / Session Info** show per-race
pending, loading, cached, loaded, or failed states and link back to the source CSV.

The `03_Classification_Race*.CSV` files contain final classification but no lap
rows. The performance analyses therefore use each race's lap timing CSV.
Existing local CSVs remain as test fixtures; they are not loaded
by the app on entry.

`public/driver_categories_all_series_2022_2026.csv` contains an annual row for
each driver found in the catalogued races, including the competition entered,
category, and source. Run `python scripts/build-driver-categories.py` to rebuild
it from Alkamel race results and the annual FIA list transcriptions linked in
the CSV. The 2022 column uses the FIA list published in October 2021 as the
preseason source. `Unknown` means no reliable category was found for that year;
categories are never copied between years. The older
`driver_categories_by_season.csv` is retained as a supplied supplement.

The current application lives at the **repository root** (`app/`, `src/`).
`Driver_Performance/` is an archived copy; do not select it as Render's root.

Start authenticated development with `npm run dev`. For production run
`npm run build`, then `npm start`. Production requires private auth variables and
an HTTPS `APP_ORIGIN`; it refuses stale or missing builds.

See [DEPLOYMENT.md](DEPLOYMENT.md) for exact Render commands, required variables,
the diagnosis and the per-file change summary. See [LOGIN.md](LOGIN.md) for login.

## Original template integration reference

The application uses
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
