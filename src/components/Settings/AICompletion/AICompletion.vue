<script lang="ts" setup>
import { settings } from '~/logic'
import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const intensityOptions = computed(() => [
  { label: '关闭', value: 'off' },
  { label: '轻 · 补当前结构', value: 'light' },
  { label: '强 · 按注释生成整段', value: 'strong' },
  { label: '思路指引 · 只给提示', value: 'guide' },
])

const testing = ref(false)
const testResult = ref('')
async function testConnection() {
  testing.value = true
  testResult.value = ''
  try {
    const r: any = await (browser as any).runtime.sendMessage({
      contentScriptQuery: 'AIComplete',
      baseURL: (settings.value.aiBaseURL || '').replace(/\/+$/, ''),
      apiKey: settings.value.aiApiKey,
      model: settings.value.aiModelName,
      maxTokens: 16,
      messages: [{ role: 'user', content: 'ping' }],
    })
    if (r && r.ok)
      testResult.value = '✓ 连接成功'
    else
      testResult.value = '✗ ' + (r?.error || `状态 ${r?.status}` || '失败')
  }
  catch (e: any) {
    testResult.value = '✗ ' + (e?.message || '失败')
  }
  testing.value = false
}
</script>

<template>
  <div>
    <SettingsItemGroup title="AI 自动补全" desc="OpenAI 兼容端点,为代码编辑器提供 ghost-text 补全。密钥仅存在本地、随请求发出。">
      <SettingsItem title="启用 AI 补全" desc="在题目代码编辑器中提供 Tab 接受的灰色补全">
        <Radio v-model="settings.aiCompletionEnabled" />
      </SettingsItem>

      <SettingsItem title="补全强度" desc="轻=补当前结构(如 for 头);强=按注释生成整段(如 //bfs);思路指引=只给中文一句话">
        <Select v-model="settings.aiIntensity" :options="intensityOptions" w="full" />
      </SettingsItem>

      <SettingsItem title="FIM 代码补全" desc="Fill In the Middle:用 /completions 端点,传光标前后文本让模型补中间(真正的代码补全,对 轻/强 生效)。DeepSeek 需把 Base URL 设为 https://api.deepseek.com/beta;端点不支持就关掉回退到 chat">
        <Radio v-model="settings.aiFim" />
      </SettingsItem>

      <SettingsItem title="思考模式" desc="对「强 / 思路指引」生效:让模型先内部推理再输出结果(更稳但更慢,仅指令实现,依赖端点模型能力)">
        <Radio v-model="settings.aiThinking" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup title="端点配置">
      <SettingsItem title="Base URL" desc="OpenAI 兼容地址,如 https://api.openai.com/v1">
        <Input v-model="settings.aiBaseURL" w-full placeholder="https://api.openai.com/v1" />
      </SettingsItem>

      <SettingsItem title="API Key">
        <Input v-model="settings.aiApiKey" type="password" w-full placeholder="sk-..." />
      </SettingsItem>

      <SettingsItem title="模型名">
        <Input v-model="settings.aiModelName" w-full placeholder="gpt-4o-mini" />
      </SettingsItem>

      <SettingsItem title="测试连接">
        <Button type="primary" :loading="testing" :disabled="!settings.aiBaseURL || !settings.aiModelName" @click="testConnection">
          测试
        </Button>
        <span v-if="testResult" ml-3 style="font-size:.82em" :style="{ color: testResult.startsWith('✓') ? 'var(--bew-success-color)' : 'var(--bew-error-color)' }">{{ testResult }}</span>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped></style>
