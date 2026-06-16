# Security

| Need                                | Pattern                                                 | Section                        |
| ----------------------------------- | ------------------------------------------------------- | ------------------------------ |
| Call an external API from the app   | DHIS2 Routes (server-side proxy)                        | § External service integration |
| Store per-user preferences          | `userDataStore/<namespace>/key`                         | § DataStore security           |
| Store sensitive config at rest      | `dataStore/<namespace>/key?encrypt=true`                | § DataStore security           |
| Integrate AI/LLM output             | Approval step before saving; no dangerouslySetInnerHTML | § AI and LLM integrations      |
| Logging / debugging                 | Never log API responses to console                      | § Never log sensitive data     |
| App must work on any DHIS2 instance | No hardcoded URLs or metadata IDs                       | § No hardcoded URLs            |
| Link to an external URL             | `rel="noreferrer"` on the anchor                        | § XSS protection               |

---

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

## AI and LLM integrations

Apps that use AI/LLM features have additional security requirements:

**Always require an explicit user approval step before writing AI output to DHIS2.**
LLM responses are non-deterministic — the user must review and confirm before anything
is saved to the server. Do not auto-save AI output:

```tsx
const [suggestion, setSuggestion] = useState<string | null>(null)

const handleGenerate = async () => {
    const result = await callAI(prompt)
    setSuggestion(result) // show for review — do not save yet
}

return suggestion ? (
    <>
        <p>{suggestion}</p>
        <Button
            primary
            onClick={() => saveMutation.mutate({ value: suggestion })}
        >
            {i18n.t('Save')}
        </Button>
        <Button onClick={() => setSuggestion(null)}>{i18n.t('Discard')}</Button>
    </>
) : (
    <Button onClick={handleGenerate}>{i18n.t('Generate')}</Button>
)
```

**Never pipe LLM output into `dangerouslySetInnerHTML`.** LLMs can be prompted to produce
malicious HTML. Render AI output as plain text:

```tsx
// Wrong — XSS risk
<div dangerouslySetInnerHTML={{ __html: llmOutput }} />

// Correct
<p>{llmOutput}</p>
```

**Do not send PII or patient data to external AI services** without explicit user
awareness. Health data (names, diagnoses, org unit names linked to patients) is sensitive.
Disclose external data transmission clearly in the UI and documentation. Prefer local
models (e.g. Ollama) when the data is sensitive.

**Never bake AI service API keys into the app bundle.** Keys (OpenAI, Anthropic, Azure,
etc.) must not appear in JavaScript output. Store them server-side and proxy through a
DHIS2 Route — see § External service integration.

---

## Never log sensitive data to the console

Do not call `console.log`, `console.error`, or similar with API responses. Console output
is visible to anyone with devtools open and is often captured by monitoring or bug
reporting tools.

```typescript
// Wrong — may expose patient or user data
console.log('API response:', response)
console.error('Error:', error) // error objects often include request payloads with data

// Correct — log only non-sensitive identifiers when necessary
console.error('Save failed:', error.httpStatus, error.httpStatusCode)
```

---

## No hardcoded URLs or instance-specific data

Apps published to the App Hub must work on **any** DHIS2 instance without code changes:

- **Never hardcode a DHIS2 instance URL.** Use `useDataEngine` or `useConfig` from
  `@dhis2/app-runtime` — they resolve the current server automatically.
- **Never hardcode metadata IDs** (program IDs, data element IDs, org unit IDs, option
  set IDs). These differ between instances. Store them as admin-configurable settings in
  DataStore — see `references/app-configuration.md`.
- **Never hardcode a production URL as a default** for external services. Use an empty
  default and require the admin to configure it.

```typescript
// Wrong
const response = await fetch('https://play.dhis2.org/api/dataElements')

// Correct — the data engine resolves the current instance
const { data } = await dataEngine.query({ de: { resource: 'dataElements' } })
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
