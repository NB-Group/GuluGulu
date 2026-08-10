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
  highlightViewedProblems: boolean // 题单/题库列表:给已浏览过的题目行/卡片加背景色

  // Custom CSS
  customizeCSS: boolean
  customizeCSSContent: string

  // Motion & glass (consumed via CSS custom properties written to documentElement)
  transitionSpeed: 'fast' | 'normal' | 'slow'
  glassOpacity: number // 0-100, mapped to --bew-content-opacity
  dockIconSize: 'small' | 'medium' | 'large' // storage + UI only; consumed by Dock.vue

  // Dock items configuration
  dockItemsConfig: { page: AppPage, visible: boolean, openInNewTab: boolean, useOriginalLuoguPage: boolean }[]

  // 主页「开始」tab 的可定制 widget 布局(Apple 小组件式网格):数组顺序=显示顺序,size=占位档
  startLayout: { i: string, size: WidgetGridSize }[]

  // AI 统一模型池 + 按模块分配(OpenAI 兼容端点)
  aiModels: AiModel[] // 模型注册表:增/删/改在一处(settings AI 面板)
  aiActiveMode: AiActiveMode // IDE 工具栏「当前走哪个模块」:off / light / strong / guide
  aiCompletion: AiCompletionModule // 代码补全模块:从池里挑模型 + 自己的 fim/thinking
  aiGuide: AiGuideModule // 思路指引/验证模块:从池里挑模型 + 自己的 thinking
}

/** AI 模型注册表条目 */
export interface AiModel {
  id: string // crypto.randomUUID()
  name: string // 展示名 "DeepSeek V3"
  baseUrl: string // https://api.deepseek.com/v1
  apiKey: string
  modelName: string // deepseek-chat
}

/** IDE 当前激活的 AI 模式(决定走哪个模块) */
export type AiActiveMode = 'off' | 'light' | 'strong' | 'guide'

/** 代码补全模块配置(light/strong 走它) */
export interface AiCompletionModule {
  modelId: string | null // 指向 aiModels[].id;null=未选
  fim: boolean
  thinking: boolean
}

/** 思路指引/验证模块配置(guide 走它,可指向另一个推理模型) */
export interface AiGuideModule {
  modelId: string | null
  thinking: boolean
}

/** 「开始」看板 widget 的尺寸档:小=4 列 / 中=6 列 / 大=12 列(整行) */
export type WidgetGridSize = 'sm' | 'md' | 'lg'

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
  highlightViewedProblems: true,
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

  aiModels: [],
  aiActiveMode: 'off',
  aiCompletion: { modelId: null, fim: true, thinking: false },
  aiGuide: { modelId: null, thinking: false },
}

/** 旧单模型配置 → 新统一模型池的一次性迁移(幂等)。 */
function migrateAiModels() {
  const s = settings.value as any
  if (Array.isArray(s.aiModels) && s.aiModels.length)
    return // 已有池子,不重复迁移
  const oldBase = s.aiBaseURL as string | undefined
  const oldKey = s.aiApiKey as string | undefined
  const oldModel = s.aiModelName as string | undefined
  if (oldBase || oldKey || oldModel) {
    const id = (globalThis.crypto?.randomUUID?.() || `m_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    s.aiModels = [{
      id,
      name: oldModel || '默认模型',
      baseUrl: oldBase || '',
      apiKey: oldKey || '',
      modelName: oldModel || '',
    }]
    s.aiCompletion = { modelId: id, fim: s.aiFim ?? true, thinking: s.aiThinking ?? false }
    s.aiGuide = { modelId: id, thinking: s.aiThinking ?? false }
    s.aiActiveMode = s.aiIntensity ?? 'off'
  }
  else {
    s.aiModels = []
    s.aiCompletion = { modelId: null, fim: true, thinking: false }
    s.aiGuide = { modelId: null, thinking: false }
    s.aiActiveMode = 'off'
  }
  // 清 orphan 旧 key(类型已删,但 localStorage 里 mergeDefaults 会保留,这里显式清掉)
  delete s.aiBaseURL
  delete s.aiApiKey
  delete s.aiModelName
  delete s.aiCompletionEnabled
  delete s.aiIntensity
  delete s.aiThinking
  delete s.aiFim
}

export const settings = useStorageLocal('settings', ref<Settings>(originalSettings), { mergeDefaults: true })

// 启动即迁移旧单模型配置进统一模型池(幂等,已有池子则跳过)
migrateAiModels()

/** 按 id 从模型池解析出完整模型配置(找不到返回 null)。供各 AI 模块在发请求前解析用。 */
export function resolveAiModel(modelId: string | null): AiModel | null {
  if (!modelId)
    return null
  return settings.value.aiModels.find(m => m.id === modelId) || null
}

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
