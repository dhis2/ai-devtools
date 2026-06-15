# ai-devtools

AI development tools for the DHIS2 ecosystem — published as standalone npm packages from this monorepo.

For guidance on using AI agents to build DHIS2 applications, see the [AI-assisted App Development guide](https://developers.dhis2.org/docs/guides/ai-development) on the DHIS2 Developer Portal.

## Packages

Packages live under `src/<namespace>/<name>` and are published to npm under the `@dhis2` scope.

| Package                                        | Description                                  |
| ---------------------------------------------- | -------------------------------------------- |
| [`@dhis2/skill-webapps`](./src/skills/webapps) | AI skill for building DHIS2 web applications |

> **Attribution** — `@dhis2/skill-webapps` is based on [dhis2-app-skills](https://github.com/devotta-labs/dhis2-app-skills) by [Eirik Haugstulen](https://github.com/eirikur-haugstulen) at [Devotta Labs](https://github.com/devotta-labs).

## Install skills

```sh
# All skills (interactive prompt to select)
npx skills add dhis2/ai-devtools

# A specific skill by name
npx skills add dhis2/ai-devtools --skill webapps

# A specific skill by path
npx skills add https://github.com/dhis2/ai-devtools/tree/main/src/skills/webapps
```

## Contributing

```sh
pnpm install        # install dependencies
pnpm lint           # check formatting
pnpm changeset      # record a changeset before opening a PR
```

See [CLAUDE.md](./CLAUDE.md) for repo structure and release flow details.
