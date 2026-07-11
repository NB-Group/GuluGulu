import '~/styles'
import 'uno.css'

import { createApp } from 'vue'

import { useDark } from '~/composables/useDark'
import { GULY_MOUNTED } from '~/constants/globalEvents'
import { AppPage } from '~/enums/appEnums'
import { setupApp } from '~/logic/common-setup'
import RESET_GULY_CSS from '~/styles/reset.css?raw'
import { runWhenIdle } from '~/utils/lazyLoad'
import { compareVersions, injectCSS, isHomePage, isInIframe } from '~/utils/main'
import { SVG_ICONS } from '~/utils/svgIcons'

import { version } from '../../package.json'
import App from './views/App.vue'

const isFirefox: boolean = /Firefox/i.test(navigator.userAgent)

// Capture-phase: block `/` key from triggering Luogu's search when typing in GuluGulu's code editor
document.addEventListener('keydown', (e) => {
  if (e.key !== '/')
    return
  const path = e.composedPath?.()
  if (!path)
    return
  for (const node of path) {
    if (node instanceof HTMLElement && (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT' || node.tagName === 'SELECT'))
      e.stopImmediatePropagation()
  }
}, true) // capture phase

// Inject the history monkey-patch script into the page context before any page JS runs.
// This ensures pushState/replaceState dispatch `historyChange` custom events that the
// Vue app listens for to detect SPA navigation on Luogu.
const injectScript = document.createElement('script')
injectScript.src = browser.runtime.getURL('dist/inject/index.js')
document.documentElement.appendChild(injectScript)

// Fix `OverlayScrollbars` not working in Firefox
if (isFirefox) {
  if (window.requestIdleCallback)
    window.requestIdleCallback = window.requestIdleCallback.bind(window)
  if (window.cancelIdleCallback)
    window.cancelIdleCallback = window.cancelIdleCallback.bind(window)
  window.requestAnimationFrame = window.requestAnimationFrame.bind(window)
  window.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
  window.setTimeout = window.setTimeout.bind(window)
  window.clearTimeout = window.clearTimeout.bind(window)
}

const currentUrl = document.URL

function _getActivatedPage(): AppPage {
  // Homepage
  if (isHomePage())
    return AppPage.Home

  // Problem list
  if (/\/problem\/list/i.test(currentUrl))
    return AppPage.ProblemList

  // Problem detail
  if (/\/problem\/\w+/i.test(currentUrl))
    return AppPage.ProblemDetail

  // Contest list
  if (/\/contest\/list/i.test(currentUrl))
    return AppPage.ContestList

  // Contest detail
  if (/\/contest\/\d+/i.test(currentUrl))
    return AppPage.ContestDetail

  // Ranking
  if (/\/ranking/i.test(currentUrl))
    return AppPage.Ranking

  // Blog or Discuss
  if (/\/blog\//i.test(currentUrl) || /\/discuss\//i.test(currentUrl))
    return AppPage.Blog

  // User profile
  if (/\/user\//i.test(currentUrl))
    return AppPage.UserProfile

  // Training
  if (/\/training\//i.test(currentUrl))
    return AppPage.Training

  // Team
  if (/\/team\//i.test(currentUrl))
    return AppPage.Team

  // Record
  if (/\/record\//i.test(currentUrl))
    return AppPage.Record

  // Search
  if (/\/search/i.test(currentUrl) || /\/problem\/keyword/i.test(currentUrl))
    return AppPage.Search

  // Default
  return AppPage.Home
}

function isAuthPage(): boolean {
  return /\/auth\/login|\/auth\/register|\/openid\//i.test(currentUrl)
}

function isSupportedPages(): boolean {
  if (isInIframe())
    return false

  // Don't take over Luogu's auth pages
  if (isAuthPage())
    return false

  if (
    /https?:\/\/(?:www\.)?luogu\.com\.cn/.test(currentUrl)
    || /https?:\/\/(?:www\.)?luogu\.com/.test(currentUrl)
    || /https?:\/\/(?:www\.)?luogu\.org/.test(currentUrl)
  ) {
    return true
  }

  return false
}

export function isSupportedIframePages(): boolean {
  if (!isInIframe())
    return false

  if (
    /https?:\/\/(?:www\.)?luogu\.com\.cn/.test(currentUrl)
    || /https?:\/\/(?:www\.)?luogu\.com/.test(currentUrl)
    || /https?:\/\/(?:www\.)?luogu\.org/.test(currentUrl)
  ) {
    return true
  }

  return false
}

let beforeLoadedStyleEl: HTMLStyleElement | undefined

// Apply dark mode + guly-design class on ALL Luogu pages (including auth)
if (/https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?/.test(currentUrl)
  || /https?:\/\/(?:www\.)?luogu\.org/.test(currentUrl)) {
  document.documentElement.classList.add('guly-design')
  // Set dark class synchronously before Vue mounts to prevent flash
  // Cache is written by useDark.ts whenever theme changes
  try {
    const cachedDark = localStorage.getItem('gulugulu-dark')
    if (cachedDark === '1') {
      document.documentElement.classList.add('dark')
    }
    else if (cachedDark === null) {
      // First visit: use system preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark')
      }
    }
    // cachedDark === '0' means light mode — do nothing
  }
  catch {}

  // Give the MAIN document a persistent, opaque background that flips with the
  // `.dark` class. The visible app background (AppBackground) lives inside the
  // Shadow DOM, so without this the main document is transparent. During a
  // View Transition the browser snapshots the whole main document; a
  // transparent base lets the default white page show through for a frame at
  // the start/end of the clip-path animation — the "flash" bug. Keeping an
  // opaque themed base under everything means any snapshot gap reveals the
  // correct color instead of white. This style is NEVER removed.
  injectCSS(`
    html.guly-design {
      background-color: #f5f5f5;
    }
    html.guly-design.dark {
      background-color: #1a1a1a;
    }
  `)

  useDark()
}

if (isSupportedPages() || isSupportedIframePages()) {
  if (!isAuthPage()) {
    // Hide the body until the app mounts (removed on GULY_MOUNTED). The themed
    // background above stays behind it permanently.
    beforeLoadedStyleEl = injectCSS(`
      body {
        display: none;
      }
    `)
  }
}

window.addEventListener(GULY_MOUNTED, () => {
  if (beforeLoadedStyleEl?.parentNode) {
    beforeLoadedStyleEl.parentNode.removeChild(beforeLoadedStyleEl)
    beforeLoadedStyleEl = undefined
  }
})

// Fallback: if Vue mount fails, show the body anyway so the page isn't permanently blank
setTimeout(() => {
  if (beforeLoadedStyleEl?.parentNode) {
    beforeLoadedStyleEl.parentNode.removeChild(beforeLoadedStyleEl)
    beforeLoadedStyleEl = undefined
  }
}, 5000)

// Set the original Luogu top bar to `display: none` to prevent flash
const removeOriginalTopBar = injectCSS(
  `.lfe-header, .header, nav.header, .navbar, #app > header, header.lfe-header, .top-nav { visibility: hidden !important; }`,
)

let onDOMLoadedCalled = false

async function onDOMLoaded() {
  if (onDOMLoadedCalled || !document.body)
    return
  onDOMLoadedCalled = true

  let originalTopBar: HTMLElement | null = null

  const isSupported = isSupportedPages() || isSupportedIframePages()

  if (isSupported && document.body) {
    // Save CSRF token and user info BEFORE clearing body
    const csrfMeta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
    const csrfToken = csrfMeta?.getAttribute('content') || ''

    // Fetch user info via frontend API (same-origin cookies, always works when logged in)
    let userIdCookie = ''
    let userName = ''
    try {
      const res = await fetch('https://www.luogu.com.cn/record/list?_contentOnly=1', { credentials: 'same-origin' })
      const json = await res.json()
      const user = json?.currentUser
      if (user?.uid) {
        userIdCookie = String(user.uid)
        userName = user.name || ''
      }
    }
    catch {}

    // Wait up to 2s for Luogu's punch card to render, then extract it
    for (let i = 0; i < 20; i++) {
      try {
        const punchEl = document.querySelector('.lg-punch')
        if (punchEl && punchEl.innerHTML.includes('运势')) {
          ;(window as any).__guly_punch = { done: true, html: punchEl.innerHTML }
          break
        }
      }
      catch {}
      await new Promise(r => setTimeout(r, 100))
    }

    // Try to find and preserve the Luogu top bar
    originalTopBar = document.querySelector<HTMLElement>(
      '.lfe-header, header.lfe-header, .header, nav.header, .navbar, #app > header, .top-nav',
    )

    // Clear the original Luogu content — GuluGulu takes over the full page
    document.body.innerHTML = ''

    // Re-inject CSRF meta tag (needed for submission)
    if (csrfToken) {
      const meta = document.createElement('meta')
      meta.name = 'csrf-token'
      meta.setAttribute('content', csrfToken)
      document.head.appendChild(meta)
    }

    // Store user data for the Vue app
    ;(window as any).__guly_user = {
      uid: userIdCookie,
      name: userName,
      csrfToken,
    }

    // Hide the original Luogu top bar — GuluGulu has its own TopBar + Dock
    if (originalTopBar) {
      ;(originalTopBar as HTMLElement).style.display = 'none'
      document.body.appendChild(originalTopBar)
    }
  }

  if (isSupported) {
    injectApp()
  }

  // Reset the original top bar display style
  if (removeOriginalTopBar)
    document.documentElement.removeChild(removeOriginalTopBar)
}

function waitForBodyThenInject() {
  if (document.body) {
    onDOMLoaded()
    return
  }
  // Luogu SPA may dynamically create body — watch for it
  const observer = new MutationObserver(() => {
    if (document.body) {
      observer.disconnect()
      onDOMLoaded()
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  // Fallback timeout
  setTimeout(() => {
    observer.disconnect()
    if (document.body)
      onDOMLoaded()
  }, 5000)
}

if (document.readyState !== 'loading')
  waitForBodyThenInject()
else
  document.addEventListener('DOMContentLoaded', () => waitForBodyThenInject())

function _injectAppWhenIdle() {
  return new Promise<void>((resolve) => {
    runWhenIdle(async () => {
      injectApp()
      resolve()
    })
  })
}

function injectApp() {
  // Remove guly element if it already exists and the version is older
  const gulyElArr: NodeListOf<Element> = document.querySelectorAll('#guly')
  if (gulyElArr.length > 0) {
    gulyElArr.forEach((el: Element) => {
      const elVersion = el.getAttribute('data-version') || '0.0.0'
      const elIsDev = el.getAttribute('data-dev') === 'true'

      // Remove if version is less than current version
      if (compareVersions(elVersion, version) < 0)
        el.remove()
      // Only the development mode element remains
      else if (!elIsDev)
        el.remove()
    })
  }

  // Mount component to context window
  const container = document.createElement('div')
  container.id = 'guly'
  container.setAttribute('data-version', version)
  container.setAttribute('data-dev', import.meta.env.DEV ? 'true' : 'false')
  // Apply dark class BEFORE Shadow DOM creation to prevent any flash
  try {
    const cachedDark = localStorage.getItem('gulugulu-dark')
    if (cachedDark === '1') {
      container.classList.add('dark')
      document.documentElement.classList.add('dark')
    }
    else if (cachedDark === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      container.classList.add('dark')
      document.documentElement.classList.add('dark')
    }
  }
  catch {}
  const root = document.createElement('div')
  const shadowDOM = container.attachShadow?.({ mode: 'open' }) || container
  const resetStyleEl = document.createElement('style')
  resetStyleEl.textContent = RESET_GULY_CSS
  shadowDOM.appendChild(resetStyleEl)
  shadowDOM.appendChild(root)
  const svgDiv = document.createElement('div')
  svgDiv.innerHTML = SVG_ICONS
  shadowDOM.appendChild(svgDiv)

  if (!document.body)
    return
  document.body.appendChild(container)

  const mountApp = () => {
    try {
      const app = createApp(App)
      setupApp(app)
      app.mount(root)
    }
    catch (e) {
      console.error('[GuluGulu] mount failed:', e)
    }
  }

  // Fetch CSS and inline as <style> — more reliable than <link> in Firefox Shadow DOM
  try {
    const cssUrl = browser.runtime.getURL('dist/contentScripts/style.css')
    fetch(cssUrl)
      .then(r => r.text())
      .then((css) => {
        const s = document.createElement('style')
        s.textContent = css
        shadowDOM.insertBefore(s, root)
        mountApp()
      })
      .catch(() => {
        mountApp()
      })
  }
  catch {
    mountApp()
  }
}
