# ai-devtools

AI development tools for the DHIS2 ecosystem — published as standalone npm packages from this monorepo.

For guidance on using AI agents to build DHIS2 applications, see the [AI-assisted App Development guide](https://developers.dhis2.org/docs/guides/ai-development) on the DHIS2 Developer Portal.

## Packages

Packages live under `src/<namespace>/<name>` and are published to npm under the `@dhis2` scope.

| Namespace | Purpose                       |
| --------- | ----------------------------- |
| `skills`  | Claude Code skill definitions |

## Contributing

```sh
pnpm install        # install dependencies
pnpm lint           # check formatting
pnpm changeset      # record a changeset before opening a PR
```

See [AGENT.md](./AGENT.md) for repo structure and release flow details.
