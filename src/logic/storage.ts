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

  // Dock items configuration
  dockItemsConfig: { page: AppPage, visible: boolean, openInNewTab: boolean, useOriginalLuoguPage: boolean }[]
}

export const originalSettings: Settings = {
  themeMode: 'auto',
  themeColor: '#3498db',
  dockPosition: 'left',
  dockAutoHide: false,
  autoHideDock: false,
  halfHideDock: false,
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
