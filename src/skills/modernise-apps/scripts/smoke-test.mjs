#!/usr/bin/env node
/**
 * smoke-test.mjs
 *
 * Standalone sanity check for a migrated DHIS2 app: starts the app's own dev
 * server pointed at a real DHIS2 server via `--proxy`, logs in the same way
 * @dhis2/cypress-commands' loginByApi() does (a plain cookie-session login,
 * no OAuth), and confirms the authenticated app shell actually renders.
 *
 * This is a skill-owned tool -- it lives in the skill's own scripts/ folder
 * with its own package.json/node_modules, and never touches the target
 * app's package.json or lockfile. Point --cwd at the app's directory; this
 * script and its dependencies can live anywhere else on disk.
 *
 * Usage (one-time setup already done, see README.md):
 *
 *   node smoke-test.mjs --cwd /path/to/migrated-app
 *
 * All flags (all optional):
 *   --cwd          Directory to run the start command in (default: process cwd)
 *   --start-cmd    Full command to start the dev server
 *                  (default: "pnpm start --proxy <server>", extended with
 *                  --port/--proxyPort only if those were overridden below)
 *   --server       Remote DHIS2 instance to proxy to
 *                  (default: https://play.im.dhis2.org/stable-2-43-1)
 *   --app-port     Port the app's own dev server listens on (default: 3000)
 *   --proxy-port   Port the App Platform's built-in proxy listens on (default: 8080)
 *   --username     Login username (default: admin)
 *   --password     Login password (default: district)
 *   --timeout      Milliseconds to wait for the dev server to come up, and
 *                  for the initial page navigation (default: 120000)
 *   --screenshot   Where to save the post-login screenshot
 *                  (default: ./smoke-test-screenshot.png -- point this
 *                  outside the app's working tree to avoid leaving a stray
 *                  file in `git status`)
 *   --selector     CSS selector that indicates a real logged-in app shell
 *                  has rendered (default: [data-test="headerbar-title"],
 *                  the standard @dhis2/ui HeaderBar's title element).
 *                  Override this if the app doesn't use the standard
 *                  App Platform shell (e.g. a plugin, or a heavily
 *                  customised header).
 *
 * Exit code: 0 on pass, 1 on any failure (unreachable server, failed login,
 * selector never appeared, or an uncaught JS error on the page).
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const DEFAULT_SERVER = 'https://play.im.dhis2.org/stable-2-43-1'
const DEFAULT_APP_PORT = 3000
const DEFAULT_PROXY_PORT = 8080
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_SCREENSHOT = './smoke-test-screenshot.png'
const DEFAULT_SELECTOR = '[data-test="headerbar-title"]'
// How long to wait for the app shell to render *after* the dev server itself
// has already responded and login has already succeeded. Kept separate from
// --timeout (which governs the much slower "dev server boot" wait).
const RENDER_TIMEOUT_MS = 45_000

let child = null
let browser = null
let cleanedUp = false

function parseArgs(argv) {
    const out = {}
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (!arg.startsWith('--')) continue
        const key = arg.slice(2)
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('--')) {
            out[key] = next
            i++
        } else {
            out[key] = true
        }
    }
    return out
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildDefaultStartCmd({ server, appPort, proxyPort }) {
    let cmd = `pnpm start --proxy ${server}`
    if (appPort !== DEFAULT_APP_PORT) cmd += ` --port ${appPort}`
    if (proxyPort !== DEFAULT_PROXY_PORT) cmd += ` --proxyPort ${proxyPort}`
    return cmd
}

async function waitForPort(url, timeoutMs) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        try {
            // Any response at all (even a Vite error overlay) means
            // something is listening -- that's all we need to know here.
            await fetch(url, { signal: AbortSignal.timeout(2000) })
            return true
        } catch {
            // Not up yet -- keep polling.
        }
        await sleep(1000)
    }
    return false
}

async function tryGetMe(request, server) {
    try {
        const res = await request.get(`${server}/api/me`, { timeout: 15_000 })
        if (res.ok()) {
            const body = await res.json()
            return {
                ok: true,
                username: body.username ?? '(unknown)',
            }
        }
        return { ok: false, message: `GET /api/me returned ${res.status()}` }
    } catch (e) {
        return { ok: false, message: `GET /api/me failed: ${e.message}` }
    }
}

/**
 * Mirrors @dhis2/cypress-commands' loginByApi(): a plain cookie-session
 * login against the DHIS2 API, no browser form interaction needed. Tries
 * the modern JSON endpoint first, falls back to the legacy form-encoded one
 * for older core versions, and verifies success via a real authenticated
 * GET rather than trusting either POST's status code in isolation.
 */
async function loginByApi({ request, server, username, password }) {
    try {
        await request.post(`${server}/api/auth/login`, {
            data: { username, password },
            timeout: 15_000,
        })
    } catch {
        // Might be an older core without this endpoint -- checked below.
    }

    let me = await tryGetMe(request, server)
    if (!me.ok) {
        try {
            await request.post(
                `${server}/dhis-web-commons-security/login.action`,
                {
                    form: { j_username: username, j_password: password },
                    timeout: 15_000,
                }
            )
        } catch {
            // Checked below either way.
        }
        me = await tryGetMe(request, server)
    }

    return me.ok
        ? { ok: true, username: me.username }
        : { ok: false, message: me.message }
}

async function cleanup() {
    if (cleanedUp) return
    cleanedUp = true

    if (browser) {
        try {
            await browser.close()
        } catch {
            // Best-effort.
        }
    }

    if (child && child.exitCode === null && !child.killed) {
        try {
            if (process.platform === 'win32') {
                spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'])
            } else {
                // Negative pid targets the whole process group (the dev
                // server plus anything it spawned, e.g. esbuild's service
                // process) since the child was launched with detached: true.
                process.kill(-child.pid, 'SIGTERM')
                await sleep(2000)
                try {
                    process.kill(-child.pid, 'SIGKILL')
                } catch {
                    // Already dead -- fine.
                }
            }
        } catch {
            // Best-effort.
        }
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2))

    const cwd = args.cwd ?? process.cwd()
    const server = args.server ?? DEFAULT_SERVER
    const appPort = Number(args['app-port'] ?? DEFAULT_APP_PORT)
    const proxyPort = Number(args['proxy-port'] ?? DEFAULT_PROXY_PORT)
    const username = args.username ?? 'admin'
    const password = args.password ?? 'district'
    const timeoutMs = Number(args.timeout ?? DEFAULT_TIMEOUT_MS)
    const screenshotPath = args.screenshot ?? DEFAULT_SCREENSHOT
    const selector = args.selector ?? DEFAULT_SELECTOR
    const startCmd =
        args['start-cmd'] ??
        buildDefaultStartCmd({ server, appPort, proxyPort })

    const appUrl = `http://localhost:${appPort}`
    const proxyOrigin = `http://localhost:${proxyPort}`

    console.log(`[smoke-test] cwd: ${cwd}`)
    console.log(`[smoke-test] starting dev server: ${startCmd}`)

    let serverOutput = ''
    child = spawn(startCmd, {
        shell: true,
        cwd,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (d) => (serverOutput += d.toString()))
    child.stderr.on('data', (d) => (serverOutput += d.toString()))

    console.log(
        `[smoke-test] waiting for ${appUrl} (timeout ${timeoutMs}ms)...`
    )
    const up = await waitForPort(appUrl, timeoutMs)
    if (!up) {
        console.error(
            `[smoke-test] FAIL: dev server never responded on ${appUrl} within ${timeoutMs}ms`
        )
        console.error('--- dev server output (last 4000 chars) ---')
        console.error(serverOutput.slice(-4000))
        return false
    }
    console.log('[smoke-test] dev server is up')

    browser = await chromium.launch()
    // A fresh, non-persisted context matters here: @dhis2/app-adapter checks
    // IndexedDB for a previously-saved base URL before falling back to
    // localStorage.DHIS2_BASE_URL. A persisted/reused profile could carry a
    // stale server URL from a previous run and silently defeat this script.
    const context = await browser.newContext()

    console.log(`[smoke-test] logging in to ${proxyOrigin} as ${username}...`)
    const loginResult = await loginByApi({
        request: context.request,
        server: proxyOrigin,
        username,
        password,
    })
    if (!loginResult.ok) {
        console.error(
            `[smoke-test] FAIL: login did not succeed: ${loginResult.message}`
        )
        console.error(
            '[smoke-test] hint: is the proxy actually up on ' +
                `${proxyOrigin}? Check --proxy-port matches what the start ` +
                'command uses, and that --server is reachable.'
        )
        return false
    }
    console.log(
        `[smoke-test] login OK (logged in as "${loginResult.username}")`
    )

    // Tell the app which server to talk to -- mirrors exactly what the
    // login form itself does on submit (`window.localStorage.DHIS2_BASE_URL
    // = server`), so the app skips its own login screen entirely and goes
    // straight to the authenticated shell using the session cookie we just
    // obtained above.
    await context.addInitScript((baseUrl) => {
        window.localStorage.setItem('DHIS2_BASE_URL', baseUrl)
    }, proxyOrigin)

    const consoleErrors = []
    const pageErrors = []
    const page = await context.newPage()
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => {
        pageErrors.push(err.message)
    })

    console.log(`[smoke-test] opening ${appUrl}...`)
    await page.goto(appUrl, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
    })

    let selectorFound = false
    try {
        await page.waitForSelector(selector, { timeout: RENDER_TIMEOUT_MS })
        selectorFound = true
    } catch {
        selectorFound = false
    }

    await mkdir(path.dirname(path.resolve(screenshotPath)), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const passed = selectorFound && pageErrors.length === 0

    console.log('')
    console.log('=== smoke-test summary ===')
    console.log(`login:            OK (as ${loginResult.username})`)
    console.log(
        `shell rendered:   ${selectorFound ? 'YES' : 'NO'} (waited for ${selector})`
    )
    console.log(`console errors:   ${consoleErrors.length}`)
    consoleErrors.slice(0, 10).forEach((m) => console.log(`  - ${m}`))
    console.log(`uncaught errors:  ${pageErrors.length}`)
    pageErrors.forEach((m) => console.log(`  - ${m}`))
    console.log(`screenshot:       ${path.resolve(screenshotPath)}`)
    console.log(`result:           ${passed ? 'PASS' : 'FAIL'}`)

    if (!selectorFound) {
        console.error(
            '[smoke-test] hint: if this app does not use the standard ' +
                '@dhis2/ui HeaderBar, re-run with --selector pointed at ' +
                'something else that only appears once logged in.'
        )
    }

    return passed
}

for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
        await cleanup()
        process.exit(1)
    })
}
process.on('uncaughtException', async (err) => {
    console.error('[smoke-test] uncaught exception:', err)
    await cleanup()
    process.exit(1)
})

main()
    .then(async (passed) => {
        await cleanup()
        process.exit(passed ? 0 : 1)
    })
    .catch(async (err) => {
        console.error('[smoke-test] unexpected error:', err)
        await cleanup()
        process.exit(1)
    })
