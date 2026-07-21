import { lineMdIcons, mingcuteIcons } from './icon-data'

const collections: Record<string, Record<string, { body: string, width?: number, height?: number }>> = {
  mingcute: mingcuteIcons.icons,
  'line-md': lineMdIcons.icons,
}

const collectionMeta: Record<string, { width: number, height: number }> = {
  mingcute: { width: mingcuteIcons.width || 24, height: mingcuteIcons.height || 24 },
  'line-md': { width: lineMdIcons.width || 24, height: lineMdIcons.height || 24 },
}

export function renderIcon(name: string, size = 24): string {
  const fallback = (reason: string): string => {
    console.warn('[GuluGulu icon]', reason, '— rendering placeholder for', name)
    // A neutral placeholder: rounded square with a diagonal slash. Inherits currentColor.
    return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="${size}" height="${size}" viewBox="0 0 24 24" style="color:inherit;opacity:.55"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="7" y1="17" x2="17" y2="7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
  }

  const [prefix, iconName] = name.split(':')
  if (!prefix || !iconName) {
    return fallback('invalid icon name')
  }

  // Strip 'i-' prefix (e.g., 'i-mingcute' -> 'mingcute')
  const cleanPrefix = prefix.replace(/^i-/, '')

  const icons = collections[cleanPrefix]
  if (!icons) {
    return fallback(`unknown collection "${cleanPrefix}"`)
  }

  const icon = icons[iconName]
  if (!icon) {
    return fallback(`missing icon "${iconName}" in "${cleanPrefix}"`)
  }

  const meta = collectionMeta[prefix]
  const w = icon.width || meta?.width || 24
  const h = icon.height || meta?.height || 24

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="${size}" height="${size}" viewBox="0 0 ${w} ${h}" style="color:inherit">${icon.body}</svg>`
}
