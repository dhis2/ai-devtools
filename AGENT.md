# ai-devtools

A pnpm monorepo for publishing AI skills as standalone npm packages under the `@dhis2` scope.

## Structure

```
ai-devtools/
├── src/
│   ├── skills/          # AI skill packages
│   │   └── <skill-name>/
│   │       ├── package.json
│   │       └── src/
│   ├── mcp/             # MCP server packages (example namespace)
│   │   └── <server-name>/
│   └── <namespace>/     # Any future namespace — no workspace config change needed
├── .changeset/          # Changesets for versioning
├── .github/workflows/   # CI/CD pipelines
└── package.json         # Root workspace config
```

All packages two levels deep under `src/` are automatically picked up by `src/*/*` in `pnpm-workspace.yaml`.

## Toolchain

- **Package manager**: pnpm (workspaces)
- **Versioning**: [Changesets](https://github.com/changesets/changesets) — one changeset per PR
- **Formatting**: Prettier (enforced on commit via husky + lint-staged)
- **CI**: GitHub Actions — verify on every push/PR, release on push to `main`

## Adding a new skill

1. Create a new directory under `src/<namespace>/<package-name>/`
2. Add a `package.json` following the pattern in `src/skills/example-skill/`
3. Write the package content in `src/<namespace>/<package-name>/src/`
4. Run `pnpm changeset` to record a changeset for the new package

Package naming convention: `@dhis2/<namespace>-<name>` (e.g. `@dhis2/skill-example`, `@dhis2/mcp-dhis2`)

## Release flow

Releases are handled automatically by the [changesets/action](https://github.com/changesets/action) GitHub Action:

1. Merge a PR that includes a changeset → the action opens a "Version Packages" PR
2. Merge the "Version Packages" PR → the action publishes updated packages to npm

To add a changeset for your changes:

```sh
pnpm changeset
```

## Development

```sh
# Install dependencies
pnpm install

# Check formatting
pnpm lint

# Fix formatting
pnpm prettier --write .
```

## Secrets required (GitHub repo settings)

| Secret                | Purpose                           |
| --------------------- | --------------------------------- |
| `DHIS2_BOT_NPM_TOKEN` | Publish to npm                    |
| `GITHUB_TOKEN`        | Automatically provided by Actions |
