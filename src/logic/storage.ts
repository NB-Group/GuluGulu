import { useStorageLocal } from '~/composables/useStorageLocal'
import type { AppPage } from '~/enums/appEnums'

export const version = useStorageLocal('version', '0.1.0')

export interface Settings {
  themeMode: 'light' | 'dark' | 'auto'
  themeColor: string
  dockPosition: 'left' | 'right' | 'bottom'
  dockAutoHide: boolean
  autoHideDock: boolean
  halfHideDock: boolean
  dockCollapsed: boolean
  disableDockGlowingEffect: boolean
  disableLightDarkModeSwitcherOnDock: boolean
  backToTopAndRefreshButtonsAreSeparated: boolean
  alwaysUseDock: boolean
  disableFrostedGlass: boolean
  reduceFrostedGlassBlur: boolean
  disableShadow: boolean
  baseFontSize: number
  pageMaxWidth: number
  gridLayout: 'adaptive' | 'twoColumn' | 'singleColumn'
  showTopBar: boolean
  topBarAutoHide: boolean
  showTopBarThemeColorGradient: boolean
  searchBarMode: 'currentTab' | 'newTab'
	  dockMessageBadge: boolean

  // Wallpaper / background
  wallpaper: string
  wallpaperMaskOpacity: number
  wallpaperBlurIntensity: number
  enableWallpaperMasking: boolean
  useLinearGradientThemeColorBackground: boolean
  individuallySetSearchPageWallpaper: boolean
  searchPageWallpaper: string
  searchPageWallpaperMaskOpacity: number
  searchPageWallpaperBlurIntensity: number
  searchPageEnableWallpaperMasking: boolean

  // Misc
  touchScreenOptimization: boolean

  // Custom CSS
  customizeCSS: boolean
  customizeCSSContent: string

  // Motion & glass (consumed via CSS custom properties written to documentElement)
  transitionSpeed: 'fast' | 'normal' | 'slow'
  glassOpacity: number // 0-100, mapped to --bew-content-opacity
  dockIconSize: 'small' | 'medium' | 'large' // storage + UI only; consumed by Dock.vue

  // Dock items configuration
  dockItemsConfig: { page: AppPage, visible: boolean, openInNewTab: boolean, useOriginalLuoguPage: boolean }[]

  // 主页「开始」tab 的可定制 widget 布局(Apple 小组件式网格):{i:widgetId, x,y,w,h}(网格单元)
  startLayout: { i: string, x: number, y: number, w: number, h: number }[]

  // AI 自动补全(OpenAI 兼容端点)
  aiCompletionEnabled: boolean
  aiBaseURL: string // 如 https://api.openai.com/v1
  aiApiKey: string
  aiModelName: string
  aiIntensity: 'off' | 'light' | 'strong' | 'guide'
}

export const originalSettings: Settings = {
  themeMode: 'auto',
  themeColor: '#3498db',
  dockPosition: 'left',
  dockAutoHide: false,
  autoHideDock: false,
  halfHideDock: false,
  dockCollapsed: false,
  disableDockGlowingEffect: false,
  disableLightDarkModeSwitcherOnDock: false,
  backToTopAndRefreshButtonsAreSeparated: false,
  alwaysUseDock: true,
  disableFrostedGlass: false,
  reduceFrostedGlassBlur: false,
  disableShadow: false,
  baseFontSize: 14.8,
  pageMaxWidth: 2280,
  gridLayout: 'adaptive',
  showTopBar: true,
  topBarAutoHide: false,
  showTopBarThemeColorGradient: false,
  searchBarMode: 'currentTab',
  dockMessageBadge: true,

  wallpaper: '',
  wallpaperMaskOpacity: 50,
  wallpaperBlurIntensity: 20,
  enableWallpaperMasking: true,
  useLinearGradientThemeColorBackground: true,
  touchScreenOptimization: false,
  customizeCSS: false,
  customizeCSSContent: '',

  transitionSpeed: 'normal',
  glassOpacity: 62,
  dockIconSize: 'medium',

  individuallySetSearchPageWallpaper: false,
  searchPageWallpaper: '',
  searchPageWallpaperMaskOpacity: 50,
  searchPageWallpaperBlurIntensity: 20,
  searchPageEnableWallpaperMasking: false,

  dockItemsConfig: [
    { page: 'Home' as AppPage, visible: true, openInNewTab: false, useOriginalLuoguPage: false },
    { page: 'ProblemList' as AppPage, visible: true, openInNewTab: false, useOriginalLuoguPage: false },
    { page: 'ContestList' as AppPage, visible: true, openInNewTab: false, useOriginalLuoguPage: false },
    { page: 'Ranking' as AppPage, visible: true, openInNewTab: false, useOriginalLuoguPage: false },
    { page: 'Blog' as AppPage, visible: true, openInNewTab: false, useOriginalLuoguPage: false },
    { page: 'Training' as AppPage, visible: true, openInNewTab: false, useOriginalLuoguPage: false },
    { page: 'Record' as AppPage, visible: true, openInNewTab: false, useOriginalLuoguPage: false },
  ],

  // startLayout 初始值在 Start.vue 启动时按 widgets 注册表 defaultLayout 自动生成;
  // 这里给空数组占位,mergeDefaults 会保留用户已有布局。
  startLayout: [],

  aiCompletionEnabled: false,
  aiBaseURL: '',
  aiApiKey: '',
  aiModelName: '',
  aiIntensity: 'off',
}

export const settings = useStorageLocal('settings', ref<Settings>(originalSettings), { mergeDefaults: true })

export type GridLayoutType = 'adaptive' | 'twoColumns' | 'singleColumn'

export interface GridLayout {
  home: GridLayoutType
}

export const gridLayout = useStorageLocal('gridLayout', ref<GridLayout>({
  home: 'adaptive',
}), { mergeDefaults: true })

export const sidePanel = useStorageLocal('sidePanel', ref<{
  home: boolean
}>({
  home: true,
}), { mergeDefaults: true })
