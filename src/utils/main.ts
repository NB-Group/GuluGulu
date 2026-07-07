/**
 * Inject CSS into the document
 */
export function injectCSS(css: string, element: HTMLElement | ShadowRoot = document.documentElement): HTMLStyleElement {
  const el = document.createElement('style')
  el.setAttribute('rel', 'stylesheet')
  el.textContent = css
  element.appendChild(el)
  return el
}

/**
 * Scroll to top smoothly
 */
export function scrollToTop(element: HTMLElement, targetScrollTop = 0 as number) {
  if (element.scrollTop === targetScrollTop)
    return

  element.scrollTo({
    top: targetScrollTop,
    behavior: 'smooth',
  })
}

/**
 * Check if the current page is the Luogu home page
 */
export function isHomePage(url: string = location.href): boolean {
  if (
    /https?:\/\/(?:www\.)?luogu\.com\.cn\/?(?:#\/?)?$/.test(url)
    || /https?:\/\/(?:www\.)?luogu\.com\.cn\/index\.html$/.test(url)
    || /https?:\/\/(?:www\.)?luogu\.com\.cn\/\?.*$/.test(url)
    || /https?:\/\/(?:www\.)?luogu\.com\/?(?:#\/?)?$/.test(url)
    || /https?:\/\/(?:www\.)?luogu\.org\/?(?:#\/?)?$/.test(url)
  ) {
    return true
  }
  return false
}

/**
 * Check if the current page is in an iframe
 */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top
  }
  catch (e) {
    return true
  }
}

/**
 * Compare two version strings
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(version1: string, version2: string): number {
  const v1Parts = version1.split('.').map(Number)
  const v2Parts = version2.split('.').map(Number)

  const maxLength = Math.max(v1Parts.length, v2Parts.length)

  for (let i = 0; i < maxLength; i++) {
    const num1 = v1Parts[i] || 0
    const num2 = v2Parts[i] || 0

    if (num1 > num2)
      return 1
    if (num1 < num2)
      return -1
  }

  return 0
}

/**
 * Wait for a DOM element to appear
 */
export function queryDomUntilFound(selector: string, timeout = 500, abort?: AbortController): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const element = document.querySelector(selector)
      if (element) {
        clearInterval(interval)
        resolve(element as HTMLElement)
      }
    }, timeout)

    if (abort) {
      abort.signal.addEventListener('abort', () => {
        clearInterval(interval)
        resolve(null)
      })
    }
  })
}

/**
 * Open a link in a new tab
 */
export function openLinkToNewTab(url: string, features: string = '') {
  window.open(url, '_blank', features)
}
