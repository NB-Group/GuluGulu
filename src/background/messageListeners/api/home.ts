import browser from 'webextension-polyfill'

const API_HOME = {
  'HOME.logout': async () => {
    // Clear session cookies but KEEP cf_clearance and __client_id (Cloudflare bypass)
    try {
      const cookies = await browser.cookies.getAll({ domain: '.luogu.com.cn' })
      const keep = new Set(['cf_clearance', '__client_id', 'C3VK'])
      for (const c of cookies) {
        if (!keep.has(c.name)) {
          await browser.cookies.remove({ name: c.name, url: `https://www.luogu.com.cn${c.path}` })
        }
      }
    }
    catch {}
    return { ok: true }
  },
  'HOME.getLoginState': async (message: any, sender?: any) => {
    // Read HttpOnly _uid cookie — content script can't access it
    try {
      const uidCookies = await browser.cookies.getAll({ name: '_uid', domain: '.luogu.com.cn' })
      const uid = uidCookies[0]?.value || ''
      let name = ''
      // Try to fetch username from Luogu user page
      if (uid) {
        try {
          const res = await fetch(`https://www.luogu.com.cn/user/${uid}`)
          const html = await res.text()
          // Try title: "nb_group(UID: 1239371) - 洛谷"
          let m = html.match(/<title>([^(]+)\(UID:\s*\d+\)\s*-\s*洛谷<\/title>/)
          if (m) {
            name = m[1].trim()
          }
          // Try lentille-context JSON
          if (!name) {
            const lc = html.match(/<script\s+id="lentille-context"[^>]*>([^<]+)<\/script>/)
            if (lc?.[1]) {
              const data = JSON.parse(lc[1])
              if (data?.data?.user?.name)
                name = data.data.user.name
            }
          }
          // Try meta or other patterns
          if (!name) {
            m = html.match(/"name":"([^"]+)"/)
            if (m)
              name = m[1]
          }
        }
        catch {}
      }
      return { uid, name }
    }
    catch {
      return { uid: '', name: '' }
    }
  },
  'HOME.checkIn': async (message: any, sender?: any) => {
    const headers: Record<string, string> = {
      'X-CSRF-TOKEN': message.csrfToken || '',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
      Origin: 'https://www.luogu.com.cn',
      Referer: 'https://www.luogu.com.cn/',
    }
    if (sender?.tab?.cookieStoreId) {
      try {
        const cookies = await browser.cookies.getAll({ storeId: sender.tab.cookieStoreId })
        if (cookies.length)
          headers.Cookie = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ')
      }
      catch {}
    }
    const res = await fetch('https://www.luogu.com.cn/index/ajax_punch', { method: 'POST', headers })
    const text = await res.text()
    try {
      return JSON.parse(text)
    }
    catch {
      return { raw: text }
    }
  },
}

export default API_HOME
