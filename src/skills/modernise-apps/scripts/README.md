# modernise-apps smoke-test

A standalone Playwright script for sanity-checking a migrated DHIS2 app
against a real server. See `../references/pnpm-migration.md` ("Step 11:
Sanity-check against a real server") for full usage docs and when to use it.

One-time setup:

```sh
pnpm install
npx playwright install chromium
```

Per run (from any directory):

```sh
node smoke-test.mjs --cwd /path/to/migrated-app
```
