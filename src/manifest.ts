import fs from 'fs-extra'
import type { Manifest } from 'webextension-polyfill'

import type PkgType from '../package.json'
import { isDev, isFirefox, isSafari, port, r } from '../scripts/utils'

export async function getManifest() {
  const pkg = (await fs.readJSON(r('package.json'))) as typeof PkgType

  const manifest: Manifest.WebExtensionManifest = {
    manifest_version: 3,
    name: `${pkg.displayName || pkg.name}${isDev ? ' Dev' : ''}`,
    version: pkg.version,
    description: pkg.description,
    homepage_url: pkg.homepage,

    background:
      isFirefox || isSafari
        ? { scripts: ['./dist/background/index.js'], persistent: isFirefox ? undefined : false }
        : { service_worker: './dist/background/index.js' },

    icons: {
      16: './assets/icon-512.png',
      48: './assets/icon-512.png',
      128: './assets/icon-512.png',
    },
    permissions: [
      'storage',
      'declarativeNetRequest',
      'tabs',
      'notifications',
      ...(isFirefox ? ['webRequest', 'webRequestBlocking', 'cookies'] : []),
    ],
    host_permissions: ['*://*.luogu.com.cn/*', '*://*.luogu.com/*', '*://*.luogu.org/*'],
    content_scripts: [
      {
        matches: [
          '*://www.luogu.com.cn/*',
          '*://www.luogu.com/*',
          '*://www.luogu.org/*',
          '*://class.luogu.com.cn/*',
          '*://space.luogu.com.cn/*',
        ],
        js: ['./dist/contentScripts/index.global.js'],
        css: ['./dist/contentScripts/style.css'],
        run_at: 'document_start',
        match_about_blank: true,
        all_frames: true,
      },
    ],
    web_accessible_resources: [
      {
        resources: ['dist/contentScripts/style.css', 'dist/inject/index.js', 'assets/*'],
        matches: ['<all_urls>'],
      },
    ],
    content_security_policy: isFirefox
      ? {
          extension_pages: 'script-src \'self\'; object-src \'self\'',
        }
      : {
          extension_pages: isDev
            ? `script-src 'self' http://localhost:${port}; object-src 'self' http://localhost:${port}`
            : 'script-src \'self\'; object-src \'self\'',
        },
    ...(isFirefox
      ? {}
      : {
          declarative_net_request: {
            rule_resources: [
              {
                id: 'ruleset_1',
                enabled: true,
                path: 'assets/rules.json',
              },
            ],
          },
        }),
  }

  if (isDev)
    manifest.permissions?.push('webNavigation')

  if (isFirefox) {
    manifest.browser_specific_settings = {
      gecko: {
        id: 'addon@gulyguly.com',
      },
    }
  }

  return manifest
}
