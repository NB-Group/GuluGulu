<script lang="ts" setup>
import { settings } from '~/logic'
import type { AiModel } from '~/logic'
import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
import ModelSelect from './ModelSelect.vue'
import ModelEditDialog from './ModelEditDialog.vue'

const activeModeOptions = computed(() => [
  { label: '关闭', value: 'off' },
  { label: '轻 · 补当前结构', value: 'light' },
  { label: '强 · 按注释生成整段', value: 'strong' },
  { label: '思路指引 · 只给提示', value: 'guide' },
])

// ---- 模型池 增/删/改 ----
const dialogVisible = ref(false)
const editing = ref<AiModel | null>(null) // null=添加
function openAdd() { editing.value = null; dialogVisible.value = true }
function openEdit(m: AiModel) { editing.value = m; dialogVisible.value = true }
function onConfirm(p: { id?: string, name: string, baseUrl: string, apiKey: string, modelName: string, apiFormat: 'openai' | 'anthropic' }) {
  if (p.id) {
    const m = settings.value.aiModels.find(x => x.id === p.id)
    if (m) Object.assign(m, { name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey, modelName: p.modelName, apiFormat: p.apiFormat })
  }
  else {
    const id = (globalThis.crypto?.randomUUID?.() || `m_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    settings.value.aiModels.push({ id, name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey, modelName: p.modelName, apiFormat: p.apiFormat })
  }
}
function removeModel(m: AiModel) {
  // 删除被某模块引用的模型 → 该模块 modelId 置空,防悬空
  if (settings.value.aiCompletion.modelId === m.id)
    settings.value.aiCompletion.modelId = null
  if (settings.value.aiGuide.modelId === m.id)
    settings.value.aiGuide.modelId = null
  if (settings.value.aiTutor.modelId === m.id)
    settings.value.aiTutor.modelId = null
  settings.value.aiModels = settings.value.aiModels.filter(x => x.id !== m.id)
}

// ---- 测试连接(逐模型)----
const testingId = ref<string | null>(null)
const resultMap = ref<Record<string, string>>({})
async function testModel(m: AiModel) {
  testingId.value = m.id
  resultMap.value[m.id] = ''
  try {
    const r: any = await (browser as any).runtime.sendMessage({
      contentScriptQuery: 'AIComplete',
      baseURL: (m.baseUrl || '').replace(/\/+$/, ''),
      apiKey: m.apiKey,
      model: m.modelName,
      apiFormat: m.apiFormat ?? 'openai',
      mode: 'chat',
      intensity: 'guide',
      maxTokens: 16,
      messages: [{ role: 'user', content: 'ping' }],
    })
    resultMap.value[m.id] = r && r.ok
      ? '✓ 连接成功'
      : '✗ ' + (r?.error || `状态 ${r?.status}` || '失败')
  }
  catch (e: any) {
    resultMap.value[m.id] = '✗ ' + (e?.message || '失败')
  }
  testingId.value = null
}
function maskKey(k: string) {
  return k ? `${k.slice(0, 4)}••••${k.slice(-4)}` : '未设置'
}
</script>

<template>
  <div>
    <!-- Section A: 模型池 -->
    <SettingsItemGroup title="AI 模型池" desc="在此统一添加 / 编辑 / 删除模型(OpenAI 兼容或 Anthropic 端点)。各模块从池中挑选。密钥仅存本地。">
      <div v-if="settings.aiModels.length" flex="~ col gap-2" p-2>
        <div
          v-for="m in settings.aiModels" :key="m.id"
          rounded="$bew-radius" border="1 $bew-border-color" bg="$bew-fill-1" p-3
        >
          <div flex="~ items-center justify-between gap-2">
            <div min-w-0 flex="~ col gap-1">
              <div flex="~ items-center gap-2">
                <span fw-600 truncate>{{ m.name || '(未命名)' }}</span>
                <span
                  v-if="m.apiFormat === 'anthropic'" px-1.5 rounded-4px
                  text="xs $bew-text-3" border="1 $bew-border-color"
                  style="flex-shrink:0;font-size:.68em"
                >Anthropic</span>
                <span text="xs $bew-text-3" truncate>{{ m.modelName || '—' }}</span>
              </div>
              <div text="xs $bew-text-3" break-all>
                {{ m.baseUrl || '未设 Base URL' }} · {{ maskKey(m.apiKey) }}
              </div>
            </div>
            <div flex="~ items-center gap-1 shrink-0">
              <Button size="small" :loading="testingId === m.id" @click="testModel(m)">
                测试
              </Button>
              <Button size="small" @click="openEdit(m)">
                编辑
              </Button>
              <Button size="small" type="tertiary" @click="removeModel(m)">
                删除
              </Button>
            </div>
          </div>
          <div
            v-if="resultMap[m.id]" mt-1 text="xs"
            :style="{ color: resultMap[m.id].startsWith('✓') ? 'var(--bew-success-color)' : 'var(--bew-error-color)' }"
          >
            {{ resultMap[m.id] }}
          </div>
        </div>
      </div>
      <div v-else p-4 text="center $bew-text-3" text-sm>
        模型池为空,点击下方添加
      </div>
      <SettingsItem>
        <Button type="primary" @click="openAdd">
          + 添加模型
        </Button>
      </SettingsItem>
    </SettingsItemGroup>

    <!-- Section B: 代码补全模块 -->
    <SettingsItemGroup title="代码补全模块" desc="题目代码编辑器的 ghost-text 补全(light/strong FIM)。从池中选模型 + 自己的参数。">
      <SettingsItem title="补全模型" desc="light/strong 走这个模型">
        <ModelSelect v-model="settings.aiCompletion.modelId" />
      </SettingsItem>
      <SettingsItem title="当前模式" desc="IDE 工具栏强度下拉 = 此值。切到思路指引则走下面的思路模块">
        <Select v-model="settings.aiActiveMode" :options="activeModeOptions" w="full" />
      </SettingsItem>
      <SettingsItem title="FIM 代码补全" desc="Fill In the Middle:用 /completions 端点补中间(对 light/strong 生效)。DeepSeek 需 Base URL 含 /beta;端点不支持就关掉回退 chat">
        <Radio v-model="settings.aiCompletion.fim" />
      </SettingsItem>
      <SettingsItem title="思考模式" desc="对 strong 生效:模型先内部推理再输出(更稳更慢)">
        <Radio v-model="settings.aiCompletion.thinking" />
      </SettingsItem>
    </SettingsItemGroup>

    <!-- Section C: 思路指引模块 -->
    <SettingsItemGroup title="思路指引模块" desc="chat 式一句话思路指引/验证(guide)。可指向另一个更强的推理模型,有自己的思考开关。">
      <SettingsItem title="思路模型" desc="当前模式=思路指引时走这个模型">
        <ModelSelect v-model="settings.aiGuide.modelId" />
      </SettingsItem>
      <SettingsItem title="思考模式" desc="让模型先内部推理再给出思路(更贴合题目、但更慢)">
        <Radio v-model="settings.aiGuide.thinking" />
      </SettingsItem>
    </SettingsItemGroup>

    <!-- Section D: 思路导师模块 -->
    <SettingsItemGroup title="思路导师模块" desc="题目页「导师」对话面板:打开时自动备课(优先消化社区题解成教学地图),再按苏格拉底阶梯引导。建议选最强的推理模型。">
      <SettingsItem title="导师模型" desc="备课与授课都用它">
        <ModelSelect v-model="settings.aiTutor.modelId" />
      </SettingsItem>
      <SettingsItem title="思考模式" desc="授课轮次的深度思考开关;备课永远强制深想,不受此开关影响">
        <Radio v-model="settings.aiTutor.thinking" />
      </SettingsItem>
    </SettingsItemGroup>

    <ModelEditDialog v-model:visible="dialogVisible" :initial="editing" @confirm="onConfirm" />
  </div>
</template>

<style lang="scss" scoped></style>
