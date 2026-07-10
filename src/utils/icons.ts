import lineMdIcons from '@iconify/json/json/line-md.json'
import mingcuteIcons from '@iconify/json/json/mingcute.json'

const collections: Record<string, Record<string, { body: string, width?: number, height?: number }>> = {
  mingcute: mingcuteIcons.icons,
  'line-md': lineMdIcons.icons,
}

const collectionMeta: Record<string, { width: number, height: number }> = {
  mingcute: { width: mingcuteIcons.width || 24, height: mingcuteIcons.height || 24 },
  'line-md': { width: lineMdIcons.width || 24, height: lineMdIcons.height || 24 },
}

export function renderIcon(name: string, size = 24): string {
  const [prefix, iconName] = name.split(':')
  if (!prefix || !iconName) {
    return ''
  }

  // Strip 'i-' prefix (e.g., 'i-mingcute' -> 'mingcute')
  const cleanPrefix = prefix.replace(/^i-/, '')

  const icons = collections[cleanPrefix]
  if (!icons) {
    return ''
  }

  const icon = icons[iconName]
  if (!icon) {
    console.warn('[GuluGulu icon] missing icon:', iconName, 'in', prefix, 'available:', Object.keys(icons).slice(0, 5))
    return ''
  }

  const meta = collectionMeta[prefix]
  const w = icon.width || meta?.width || 24
  const h = icon.height || meta?.height || 24

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="${size}" height="${size}" viewBox="0 0 ${w} ${h}" style="color:inherit">${icon.body}</svg>`
}

// Prevent tree-shaking: force access to commonly used icons
void (mingcuteIcons.icons['home-4-fill'] && mingcuteIcons.icons['home-4-line']
  && lineMdIcons.icons['moon-to-sunny-outline-transition'])
