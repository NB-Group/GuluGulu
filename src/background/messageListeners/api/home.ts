import browser from 'webextension-polyfill'

const API_HOME = {
  'HOME.logout': async () => {
    try {
      const cookies = await browser.cookies.getAll({ domain: '.luogu.com.cn' })
      const keep = new Set(['cf_clearance', 'C3VK'])
      for (const c of cookies) {
        if (!keep.has(c.name)) {
          await browser.cookies.remove({ name: c.name, url: `https://www.luogu.com.cn${c.path}` })
        }
      }
    } catch (e) { console.warn('[GuluGulu]', e) }
    return { ok: true }
  },
}

export default API_HOME
