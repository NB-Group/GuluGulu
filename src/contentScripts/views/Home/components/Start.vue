<script setup lang="ts">
import { GridLayout, GridItem } from 'grid-layout-plus'
import { defineAsyncComponent } from 'vue'
import { renderIcon } from '~/utils/icons'
import { settings } from '~/logic'
import { WIDGETS, WIDGET_MAP, defaultLayout } from './widgets'
import type { WidgetLayoutItem } from './widgets/types'

// 预建异步组件 map(id → async component)
const widgetComponents: Record<string, ReturnType<typeof defineAsyncComponent>> = {}
for (const w of WIDGETS)
  widgetComponents[w.id] = defineAsyncComponent(w.component)

// 布局:本地 ref <-> settings.startLayout;空时用注册表 defaultLayout 初始化
const layout = ref<WidgetLayoutItem[]>([])
function ensureLayout() {
  const saved = (settings.value.startLayout && settings.value.startLayout.length)
    ? settings.value.startLayout.filter(it => WIDGET_MAP[it.i])
    : []
  layout.value = saved.length ? saved : defaultLayout()
  if (!saved.length)
    settings.value.startLayout = layout.value
}
watch(() => layout.value, (v) => { settings.value.startLayout = v }, { deep: true })

const editing = ref(false)

// 添加器
const pickerOpen = ref(false)
const available = computed(() => WIDGETS.filter(w => !layout.value.some(it => it.i === w.id)))
function addWidget(id: string) {
  const def = WIDGET_MAP[id]
  if (!def)
    return
  // 放到最下面
  const maxY = layout.value.reduce((m, it) => Math.max(m, it.y + it.h), 0)
  layout.value.push({ i: id, x: 0, y: maxY, w: def.defaultLayout.w, h: def.defaultLayout.h })
  // grid-layout-plus 用 push 新对象即可触发
  layout.value = [...layout.value]
}
function removeWidget(id: string) {
  layout.value = layout.value.filter(it => it.i !== id)
}

// 刷新所有 widget(重按 tab 时 Home.vue 调 tabPageRef.initData())
const pageRef = ref()
function initData() {
  // 触发各 widget 重新挂载(通过 key 变化)
  refreshKey.value++
  pageRef.value?.forEach?.(() => {})
}
const refreshKey = ref(0)
defineExpose({ initData })

onMounted(ensureLayout)
</script>

<template>
  <div :class="{ 'start-grid-editing': editing }">
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

    <GridLayout
      v-model:layout="layout"
      :col-num="12"
      :row-height="28"
      :margin="[12, 12]"
      :is-draggable="editing"
      :is-resizable="editing"
      :use-css-transforms="true"
      :prevent-collision="false"
      :vertical-compact="true"
      drag-allow-from=".widget-head"
      drag-ignore-from=".no-drag"
    >
      <GridItem
        v-for="item in layout" :key="item.i"
        :i="item.i" :x="item.x" :y="item.y" :w="item.w" :h="item.h"
        :is-draggable="editing" :is-resizable="editing"
      >
        <div class="widget-card" :class="{ editing }">
          <!-- 卡片头(拖拽手柄)-->
          <div class="widget-head" flex="~ items-center gap-2">
            <span v-if="editing" class="grip no-drag" style="display:contents;color:var(--bew-text-4)" v-html="renderIcon('mingcute:menu-line', 14)" />
            <span style="display:contents;color:var(--bew-theme-color)" v-html="renderIcon(WIDGET_MAP[item.i]?.icon || 'mingcute:app-window-line', 16)" />
            <span flex-1 style="font-size:.92em;font-weight:700;color:var(--bew-text-1)">{{ WIDGET_MAP[item.i]?.name || item.i }}</span>
            <button v-if="editing" class="widget-remove no-drag" title="移除" @click.stop="removeWidget(item.i)">
              <span style="display:contents" v-html="renderIcon('mingcute:close-line', 14)" />
            </button>
          </div>
          <!-- 内容 -->
          <div class="widget-body" :key="refreshKey + '-' + item.i">
            <component :is="widgetComponents[item.i]" :w="item.w" :h="item.h" />
          </div>
        </div>
      </GridItem>
    </GridLayout>

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

// grid-layout-plus 的 item 是 absolute 定位,内部撑满
:deep(.vgl-item) {
  border-radius: var(--bew-radius);
  transition: transform var(--bew-dur-cozy) var(--bew-ease-smooth);
}
// 编辑模式:整区禁止文本选择,避免拖拽时选中
.start-grid-editing { user-select: none; -webkit-user-select: none; }
// 编辑模式:缩放手柄可见
:deep(.vgl-item__resize-handle) {
  z-index: 5;
  width: 14px !important; height: 14px !important;
  right: 2px !important; bottom: 2px !important;
}
.editing :deep(.vgl-item__resize-handle) {
  visibility: visible;
}
:deep(.vgl-item__resize-handle) {
  visibility: hidden;
}

.widget-card {
  height: 100%;
  box-sizing: border-box;
  display: flex; flex-direction: column;
  background: var(--bew-content);
  backdrop-filter: var(--bew-filter-glass-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
  padding: 12px 14px;
  overflow: hidden;
  transition: box-shadow var(--bew-dur-fast) ease;
}
.widget-head { margin-bottom: 8px; flex-shrink: 0; }
.widget-body { flex: 1; min-height: 0; overflow: auto; }

// 编辑模式:抖动 + 删除按钮 + 头部拖拽光标 + 内容禁用交互(防误点)
.widget-card.editing {
  cursor: grab;
  &:active { cursor: grabbing; }
  .widget-body { pointer-events: none; }   // 内容不响应点击,避免误跳转
  .widget-head { cursor: grab; }
}
.widget-remove {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bew-error-color); color: #fff; border: none; cursor: pointer;
  box-shadow: 0 2px 6px rgba(0,0,0,.2);
}

// 抖动:套一层内层 span 上做轻微旋转,避免和 grid 的 transform 冲突
@keyframes jiggle {
  0%, 100% { transform: rotate(-0.5deg); }
  50% { transform: rotate(0.5deg); }
}
.widget-card.editing {
  animation: jiggle 0.6s ease-in-out infinite;
}

.picker-item {
  padding: 14px; border-radius: var(--bew-radius-half); cursor: pointer;
  background: var(--bew-fill-1); border: 1px solid var(--bew-border-color);
  transition: all var(--bew-dur-fast) ease;
  &:hover { border-color: var(--bew-theme-color-40); transform: translateY(-2px); box-shadow: var(--bew-shadow-1); }
}
</style>
