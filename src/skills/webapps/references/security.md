# Security

## External service integration: use DHIS2 Routes

**Never store third-party API credentials (tokens, passwords, keys) in DataStore, UserDataStore,
or any browser-accessible storage.** Storing credentials client-side exposes them through
JavaScript memory, network payloads, and XSS attacks. This is an App Hub compliance requirement —
apps that do this will be rejected or removed.

The correct pattern is **DHIS2 Routes** — a server-side proxy built into the platform. Routes
store upstream credentials encrypted on the server (non-retrievable via the API) and proxy
requests on behalf of the app.

### How it works

**Step 1 — Administrator creates a route** via the Route Manager App or the `routes` API:

- Configures upstream URL and auth method: `http-basic`, `api-token`, or `oauth2-client-credentials`
- Sets an `authorities` array to control which users can invoke the route
- Requires `route.remote_servers_allowed = true` in `dhis.conf`

**Step 2 — App calls the external service through the route:**

```typescript
import { useDataEngine } from '@dhis2/app-runtime'

const engine = useDataEngine()

const result = await engine.query({
    externalData: {
        resource: 'routes/my-route-id/run',
    },
})
```

The app never sees the credentials. If the external service rotates its key, the admin updates
the route — no app redeploy needed.

---

## DataStore security

When storing configuration in DataStore or UserDataStore:

- **Prefer `UserDataStore` over `DataStore`** for user-specific or sensitive settings — values
  are scoped to the individual user and not readable by others.
- **Encrypt sensitive values** at rest by adding `?encrypt=true` to the write. The platform
  encrypts the stored value; it is returned decrypted only to authorized users.
- **Use DataStore sharing** to restrict namespace access — set sharing on the namespace via the
  DataStore sharing API rather than relying solely on app-level guards.
- **Never store external service credentials** (API keys, passwords, tokens) in DataStore or
  UserDataStore — use DHIS2 Routes instead (see above).

```typescript
// Per-user settings → UserDataStore
const userSettingsMutation = {
    resource: 'userDataStore/my-app/settings',
    type: 'create' as const,
    data: { theme: 'dark' },
}

// Sensitive internal config → encrypt at rest
const sensitiveConfigMutation = {
    resource: 'dataStore/my-app/config',
    type: 'create' as const,
    params: { encrypt: true },
    data: { internalToken: value },
}
```

---

## XSS protection

- **Set `rel="noreferrer"` on all external links** — prevents the target page from accessing
  `window.opener` and leaking the referrer URL:

    ```tsx
    <a href={externalUrl} target="_blank" rel="noreferrer">
        {i18n.t('Open documentation')}
    </a>
    ```

- **No externally-hosted scripts or stylesheets.** Bundle all assets with the app — loading
  from external CDNs or third-party hosts is not permitted in App Hub apps.
