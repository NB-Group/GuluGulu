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
