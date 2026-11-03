// Must run before any tldraw module loads — see the file for why.
import './structured-clone-shim'

import './index.css'

import { initializeLocalUser, subscribeLocalProfileStorage } from './features/profile/host-state'

import { startHmrWatchdog } from './platform/hmr-watchdog'

// React Fast Refresh works here despite React being externalized to the
// locally-vendored ESM (frontend/externalize-react.ts + the importmap in
// index.html → /vendor/react): Bun's bundled refresh runtime wraps
// `__REACT_DEVTOOLS_GLOBAL_HOOK__` before the vendored react-dom registers,
// and the hook is a plain global, so the renderer link works across the
// bundle/vendor boundary. The one missing piece was that the externalized
// virtual modules (`esm:react/jsx-dev-runtime` etc.) were never hot-accepted,
// which made EVERY edit propagate to the entry and force a full reload —
// fixed by the `import.meta.hot.accept()` in externalize-react.ts. Accepted
// component edits apply in place; updates reaching non-component or mixed
// exports still fall back to Bun's full reload.
if (import.meta.hot) {
  startHmrWatchdog()
}

subscribeLocalProfileStorage()

export async function init(el: HTMLElement) {
  // Startup config and any proxy-verified user load in parallel with the
  // main chunk, so both are available synchronously from the first render.
  const [{ mount }, config] = await Promise.all([
    import('./main'),
    import('./api/app-config').then(m => m.loadAppConfig())
  ])
  initializeLocalUser(!config?.demo)
  mount(el)
}

// Expose init globally so the preload script can call it
globalThis.__init = init
