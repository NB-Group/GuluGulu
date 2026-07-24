<script setup lang="ts">
import draggable from 'vuedraggable'
import { defineAsyncComponent } from 'vue'
import { renderIcon } from '~/utils/icons'
import { settings } from '~/logic'
import { WIDGETS, WIDGET_MAP, defaultLayout, sizeCols } from './widgets'
import type { WidgetLayoutItem, WidgetSize } from './widgets/types'

// 预建异步组件 map(id → async component)
const widgetComponents: Record<string, ReturnType<typeof defineAsyncComponent>> = {}
for (const w of WIDGETS)
  widgetComponents[w.id] = defineAsyncComponent(w.component)

// 布局:本地 ref <-> settings.startLayout;空/脏时用注册表 defaultLayout 初始化
const layout = ref<WidgetLayoutItem[]>([])
function normalize(saved: any[]): WidgetLayoutItem[] {
  // 兼容旧版 {x,y,w,h} 格式 → 按 w 折算成 size;非法条目丢弃
  const out: WidgetLayoutItem[] = []
  for (const it of saved) {
    if (!it || !WIDGET_MAP[it.i])
      continue
    let size: WidgetSize = WIDGET_MAP[it.i].defaultSize
    if (it.size === 'sm' || it.size === 'md' || it.size === 'lg')
      size = it.size
    else if (typeof it.w === 'number')
      size = it.w >= 11 ? 'lg' : it.w >= 5 ? 'md' : 'sm'
    out.push({ i: it.i, size })
  }
  return out
}
function ensureLayout() {
  const saved = (settings.value.startLayout && settings.value.startLayout.length)
    ? normalize(settings.value.startLayout as any[])
    : []
  layout.value = saved.length ? saved : defaultLayout()
  if (!saved.length)
    settings.value.startLayout = layout.value
}
watch(() => layout.value, (v) => { settings.value.startLayout = v }, { deep: true })

const editing = ref(false)

// 尺寸循环 sm → md → lg → sm
const SIZE_ORDER: WidgetSize[] = ['sm', 'md', 'lg']
const SIZE_LABEL: Record<WidgetSize, string> = { sm: '小', md: '中', lg: '大' }
function cycleSize(id: string) {
  const it = layout.value.find(x => x.i === id)
  if (!it)
    return
  const idx = SIZE_ORDER.indexOf(it.size)
  it.size = SIZE_ORDER[(idx + 1) % SIZE_ORDER.length]
  layout.value = [...layout.value]
}

// 添加器
const pickerOpen = ref(false)
const available = computed(() => WIDGETS.filter(w => !layout.value.some(it => it.i === w.id)))
function addWidget(id: string) {
  const def = WIDGET_MAP[id]
  if (!def)
    return
  layout.value.push({ i: id, size: def.defaultSize })
  layout.value = [...layout.value]
}
function removeWidget(id: string) {
  layout.value = layout.value.filter(it => it.i !== id)
}

// 刷新所有 widget(重按 tab 时 Home.vue 调 tabPageRef.initData())
const refreshKey = ref(0)
function initData() {
  refreshKey.value++
}
defineExpose({ initData })

onMounted(ensureLayout)
</script>

<template>
  <div :class="{ 'start-editing': editing }">
    <!-- 顶栏:编辑开关 + 添加 -->
    <div flex="~ items-center justify-end gap-2" mb-3>
      <button
        v-if="editing" class="press-btn" flex="~ items-center gap-1"
        :disabled="available.length === 0"
        :style="{ opacity: available.length === 0 ? 0.4 : 1 }"
        @click="pickerOpen = true"
      >
        <span style="display:contents" v-html="renderIcon('mingcute:add-line', 16)" /> 添加小组件
      </button>
      <button class="press-btn primary" flex="~ items-center gap-1" @click="editing = !editing">
        <span style="display:contents" v-html="renderIcon(editing ? 'mingcute:check-line' : 'mingcute:edit-line', 16)" />
        {{ editing ? '完成' : '编辑布局' }}
      </button>
    </div>

    <div v-if="layout.length === 0 && !editing" style="text-align:center;color:var(--bew-text-3);padding:48px 0">
      看板是空的,点「编辑布局」添加小组件
    </div>

    <draggable
      v-model="layout"
      item-key="i"
      :animation="240"
      :disabled="!editing"
      handle=".widget-head"
      ghost-class="widget-ghost"
      chosen-class="widget-chosen"
      drag-class="widget-dragging"
      class="start-grid"
    >
      <template #item="{ element }">
        <div
          class="widget-wrap"
          :style="{ gridColumn: `span ${sizeCols(element.size)}` }"
        >
          <div class="widget-card" :class="{ editing }">
            <!-- 卡片头(拖拽手柄)-->
            <div class="widget-head" flex="~ items-center gap-2">
              <span v-if="editing" class="grip" style="display:contents;color:var(--bew-text-4)" v-html="renderIcon('mingcute:menu-line', 14)" />
              <span style="display:contents;color:var(--bew-theme-color)" v-html="renderIcon(WIDGET_MAP[element.i]?.icon || 'mingcute:grid-line', 16)" />
              <span flex-1 style="font-size:.92em;font-weight:700;color:var(--bew-text-1)">{{ WIDGET_MAP[element.i]?.name || element.i }}</span>
              <template v-if="editing">
                <button class="widget-act" :title="`尺寸: ${SIZE_LABEL[element.size]}`" @click.stop="cycleSize(element.i)">
                  <span style="display:contents" v-html="renderIcon('mingcute:scale-line', 14)" />
                  {{ SIZE_LABEL[element.size] }}
                </button>
                <button class="widget-remove" title="移除" @click.stop="removeWidget(element.i)">
                  <span style="display:contents" v-html="renderIcon('mingcute:close-line', 12)" />
                </button>
              </template>
            </div>
            <!-- 内容 -->
            <div class="widget-body" :key="refreshKey + '-' + element.i">
              <component :is="widgetComponents[element.i]" :size="element.size" />
            </div>
          </div>
        </div>
      </template>
    </draggable>

    <!-- 添加小组件选择器 -->
    <Dialog v-model:visible="pickerOpen" title="添加小组件" :show-footer="false" append-to-body :width="420">
      <div v-if="available.length === 0" style="text-align:center;color:var(--bew-text-3);padding:24px 0">
        所有的小组件都已添加
      </div>
      <div v-else grid="~ cols-2 gap-3">
        <button
          v-for="w in available" :key="w.id"
          class="picker-item" flex="~ items-center gap-2"
          @click="addWidget(w.id); pickerOpen = false"
        >
          <span style="display:contents;color:var(--bew-theme-color)" v-html="renderIcon(w.icon, 20)" />
          <span style="font-size:.9em;color:var(--bew-text-1);font-weight:600">{{ w.name }}</span>
        </button>
      </div>
    </Dialog>
  </div>
</template>

<style scoped lang="scss">
.press-btn {
  padding: 4px 12px; border-radius: var(--bew-radius-half); cursor: pointer;
  font-size: .85em; font-weight: 600; white-space: nowrap;
  background: var(--bew-fill-1); color: var(--bew-text-2);
  border: 1px solid var(--bew-border-color);
  transition: all var(--bew-dur-fast) ease;
  &:hover { border-color: var(--bew-theme-color-40); color: var(--bew-text-1); }
  &.primary { background: var(--bew-theme-color); color: #fff; border-color: var(--bew-theme-color); }
}

// 12 列响应式网格;vuedraggable 的根容器就是它
.start-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: minmax(190px, auto);
  gap: 14px;
  align-items: stretch;
}
@media (max-width: 720px) {
  // 窄屏:小卡片也占满半行,避免挤成一条
  .start-grid { grid-template-columns: repeat(2, 1fr); }
  .widget-wrap { grid-column: span 2 !important; }
}

// 编辑模式:整区禁止文本选择,避免拖拽时选中
.start-editing { user-select: none; -webkit-user-select: none; }

.widget-wrap { min-width: 0; }

.widget-card {
  position: relative;
  height: 100%;
  min-height: 190px;
  box-sizing: border-box;
  display: flex; flex-direction: column;
  background: var(--bew-content);
  backdrop-filter: var(--bew-filter-glass-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
  padding: 12px 14px;
  overflow: hidden;
  transition: box-shadow var(--bew-dur-fast) ease, transform var(--bew-dur-fast) ease;
}
.widget-head { margin-bottom: 8px; flex-shrink: 0; cursor: default; }
.widget-body { flex: 1; min-height: 0; overflow: auto; }

// 编辑态:手柄可抓、内容禁用交互(防误点)、抖动
.widget-card.editing {
  .widget-head { cursor: grab; }
  .widget-body { pointer-events: none; }
}
.widget-chosen .widget-card { box-shadow: var(--bew-shadow-edge-glow-2), var(--bew-shadow-3); }
.widget-dragging { opacity: 0.96; cursor: grabbing; }
.widget-ghost .widget-card { opacity: 0.35; background: var(--bew-fill-1); }

.widget-act {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 8px; border-radius: var(--bew-radius-half);
  font-size: .72em; font-weight: 600; color: var(--bew-text-2);
  background: var(--bew-fill-1); border: 1px solid var(--bew-border-color);
  cursor: pointer; white-space: nowrap;
  transition: all var(--bew-dur-fast) ease;
  &:hover { color: var(--bew-theme-color); border-color: var(--bew-theme-color-40); }
}
.widget-remove {
  width: 18px; height: 18px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bew-error-color); color: #fff; border: none; cursor: pointer;
  box-shadow: 0 2px 6px rgba(0,0,0,.2);
}

// 抖动:只在编辑态、且作用在卡片内层(不影响 vuedraggable 的 FLIP transform)
@keyframes jiggle {
  0%, 100% { transform: rotate(-0.45deg); }
  50% { transform: rotate(0.45deg); }
}
.widget-card.editing {
  animation: jiggle .6s ease-in-out infinite;
}

.picker-item {
  padding: 14px; border-radius: var(--bew-radius-half); cursor: pointer;
  background: var(--bew-fill-1); border: 1px solid var(--bew-border-color);
  transition: all var(--bew-dur-fast) ease;
  &:hover { border-color: var(--bew-theme-color-40); transform: translateY(-2px); box-shadow: var(--bew-shadow-1); }
}
</style>
