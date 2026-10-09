# Setting Up Continuous Delivery to the App Hub

This is the recipe for wiring an app up to publish itself to the [DHIS2 App
Hub](https://apps.dhis2.org) automatically, instead of the manual
`yarn version --patch` → push tag → draft GitHub Release flow described in
[the App Hub publishing guide](https://developers.dhis2.org/docs/guides/publish-apphub).
**Use the shared `dhis2/workflows-platform` `release.yml` reusable workflow for this, not
the bespoke `apphub-release.yml` + `d2-app-scripts publish` workflow the guide shows** — the
shared workflow already exists, is what current DHIS2 apps actually use, and drives
versioning from conventional commits (via `dhis2/action-semantic-release`) rather than a
manual version bump per release. This is independent of the other modernisation tasks — an
app can need this in any combination with pnpm/style-configs/platform-library/CI work.

Reference: [`dhis2/workflows-platform`'s `release.yml`](https://github.com/dhis2/workflows-platform/blob/v2/.github/workflows/release.yml)
and [`dhis2/action-semantic-release`](https://github.com/dhis2/action-semantic-release) (the
action it calls — see `custom/semantic-release-apphub.js` for exactly what it checks before
publishing).

---

## Step 1: Check whether this is even needed

**Offer this, don't silently add it** — it changes how releases happen (automatic, driven by
commit messages, on every push to the default branch) and needs a secret only a human with
App Hub publish rights can create. Check first whether it's already set up:

- Does any `.github/workflows/*.yml` already call
  `dhis2/workflows-platform/.github/workflows/release.yml@<ref>` (any ref)? If so, and
  `publish_apphub` isn't explicitly set to `false`, App Hub delivery is already live —
  nothing to do.
- Does a bespoke workflow already run `d2-app-scripts publish` (the manual pattern from the
  guide)? That's a working, if higher-maintenance, alternative — ask whether the user wants
  to replace it with the shared workflow or leave it, don't assume.
- Is `d2.config.js`'s `type` set to `'lib'`? App Hub publish is a no-op for libraries — the
  `semantic-release-apphub` plugin itself skips it silently. Don't set this up for a library.

If none of the above rule it out, this app genuinely has no App Hub CD yet — offer to set it
up rather than doing it unprompted.

## Step 2: Get the App Hub app ID — ask the user, don't guess

`d2.config.js` needs an `id` field: the app's App Hub UUID (e.g.
`b783bf32-0cc2-4d31-aadc-22d4c4807c30`). **There is no way to derive or look this up
unilaterally — always ask the user for it.** Two cases:

- **The app is already listed on the App Hub** (published before, just never wired up to
  CD). The user finds it by navigating to their app's page on apps.dhis2.org and copying the
  UUID out of the URL.
- **The app has never been listed on the App Hub at all.** The one-time initial submission
  and DHIS2 Core Team review is a manual step this skill can't perform — the user needs to
  submit it once through the App Hub UI to get an ID before this automation has anything to
  attach to. Tell them this rather than inventing a placeholder ID.

Add (or update) in `d2.config.js`:

```javascript
const config = {
    id: '<the UUID the user provided>',
    // ...existing fields
}
```

Also confirm `minDHIS2Version` is set — most existing apps already have it (it's used at
runtime by the App Management app, not just App Hub publishing), but the
`semantic-release-apphub` plugin hard-fails the release if it's missing, so check rather than
assume:

```bash
node -e "console.log(require('./d2.config.js').minDHIS2Version)"
```

## Step 3: Confirm commit-message linting is in place

Versioning is driven entirely by [conventional commits](https://www.conventionalcommits.org/)
via `@semantic-release/commit-analyzer` — `fix:`/`feat:`/`BREAKING CHANGE:` commits produce a
patch/minor/major release respectively, anything else produces no release at all. If this
repo doesn't already enforce conventional commits (a `lint-commits`/`lint-pr-title` job, or
local commitlint hook), releases will be unpredictable or silently never trigger. Set that up
first if it's missing — see `references/style-configs-migration.md` Step 9 (or, if the app
is still on `cli-style`, its existing `lint-commits`/`lint-pr-title` jobs already cover this).

## Step 4: Get the `DHIS2_BOT_APPHUB_TOKEN` secret added — never ask for the token itself

The workflow needs an App Hub API key in this repo's `DHIS2_BOT_APPHUB_TOKEN` secret
(Settings → Secrets and variables → Actions). **Never ask the user to paste or share the
token value** — a secret typed into a chat with an agent defeats the point of it being a
secret. Instead:

1. Tell the user what's needed and where it comes from: a human with publish rights on the
   App Hub account this app releases under signs into apps.dhis2.org, profile icon → "Your
   API Keys" → generate one (it's shown once, so it must be saved immediately).
2. Ask them to add it themselves, directly in GitHub — repo Settings → Secrets and variables
   → Actions → New repository secret, named exactly `DHIS2_BOT_APPHUB_TOKEN`. **This isn't
   something this skill can do on the user's behalf** even if given the value; don't offer to
   run `gh secret set` with a value the user pastes.
3. Once they say it's done, confirm it by checking the secret _exists_ —
   `gh secret list` lists names and last-updated dates only, never values — and treat that as
   the confirmation, not a value they report back to you.

Don't proceed to Step 5/6 until this confirms as set.

## Step 5: Wire the reusable release workflow

Add (or extend an existing combined workflow file with) a `release` job pointed at the ref
this app already uses for other `dhis2/workflows-platform` jobs (see
`references/ci-migration.md` Step 3 for picking `@v1`/`pnpm`/`@v2`) — gated on lint/test
passing, and on the default branch only:

```yaml
# .github/workflows/release.yml (or folded into an existing combined workflow)
name: release

on:
    push:
        branches: [main]

concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: false

jobs:
    lint-commits:
        uses: dhis2/workflows-platform/.github/workflows/lint-commits.yml@v2
    lint:
        uses: dhis2/workflows-platform/.github/workflows/lint.yml@v2
    test:
        uses: dhis2/workflows-platform/.github/workflows/test.yml@v2
    release:
        needs: [lint-commits, lint, test]
        uses: dhis2/workflows-platform/.github/workflows/release.yml@v2
        with:
            publish_apphub: true
            apphub_channel: stable # or 'development'/'canary' if the user wants a pre-release channel
        secrets: inherit
```

`secrets: inherit` matters here beyond just the two secrets `release.yml` declares
(`DHIS2_BOT_GITHUB_TOKEN`, `DHIS2_BOT_APPHUB_TOKEN`) — the job also references
`DHIS2_BOT_SSH_SIGNING_KEY`/`DHIS2_BOT_SSH_SIGNING_PASSPHRASE` for signed release commits,
which aren't declared as required inputs but still need to flow through. Passing secrets
individually instead of `inherit` will silently break commit signing.

If a bespoke `release`/`publish` job already exists (e.g. an npm-only `release.yml@<ref>`
wrapper from `references/ci-migration.md` Step 2 without App Hub wired up), extend that same
job with `publish_apphub: true` rather than adding a second, competing release job.

## Step 6: Verify

This can't be verified with a normal CI dry run — a real release actually publishes to the
App Hub and creates a GitHub release. Confirm instead by:

- Checking the workflow YAML is valid and the `uses:` ref resolves (a typo here fails
  silently — see `references/ci-migration.md`'s troubleshooting entry on this).
- Confirming `DHIS2_BOT_APPHUB_TOKEN` is present in repo secrets (Step 4) — you can check it
  exists via `gh secret list`, but never its value.
- Telling the user the next `fix:`/`feat:` commit merged to the default branch will trigger a
  real release, and to watch that first run in the Actions tab rather than assuming success.

## Troubleshooting

| Symptom                                                                              | Fix                                                                                                                                                                           |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release job fails with `EMISSINGAPPHUBID` / `'id' field missing from d2.config.js`   | Step 2 wasn't completed, or the ID was added somewhere other than `d2.config.js`'s top-level `id` field.                                                                      |
| Release job fails with `EMISSINGMINDHIS2VERSION`                                     | `minDHIS2Version` is missing from `d2.config.js` — see Step 2.                                                                                                                |
| Release job fails with `EMISSINGTOKEN` / `D2_APP_HUB_TOKEN missing from environment` | `DHIS2_BOT_APPHUB_TOKEN` isn't set in repo secrets, or the job wasn't given `secrets: inherit` — see Steps 4-5.                                                               |
| Pushed `fix:`/`feat:` commits to the default branch but no release happens           | Check `lint-commits` is passing (a non-conventional commit message produces no release, not an error) and that the `release` job's `needs:` aren't failing upstream.          |
| App Hub publish is silently skipped                                                  | `d2.config.js`'s `type` is `'lib'` — the `semantic-release-apphub` plugin intentionally no-ops for libraries. This is expected, not a bug, if the app is genuinely a library. |
