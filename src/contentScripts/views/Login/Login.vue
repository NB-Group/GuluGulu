<script setup lang="ts">
import { renderIcon } from '~/utils/icons'

const uid = computed(() => (window as any).__guly_user?.uid || '')
const isLoggedIn = computed(() => !!uid.value && uid.value !== '0')

function doLogin() {
  // Redirect to Luogu's real login page — Cloudflare Turnstile, WebAuthn, etc. handled natively
  window.location.href = 'https://www.luogu.com.cn/auth/login'
}

function refreshPage() {
  window.location.reload()
}
</script>

<template>
  <div class="page-container" w-full h-full p="x-4 md:x-8 lg:x-16" pos="relative">
    <Transition name="content-reveal">
      <div
        bg="$bew-content" rounded="$bew-radius" p="x-8 y-12"
        shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
        border="1 $bew-border-color"
        style="backdrop-filter: var(--bew-filter-glass-1)"
        flex="~ col" items="center" text="center"
        max-w="440px" mx-auto mt-20
      >
        <template v-if="isLoggedIn">
          <span v-html="renderIcon('mingcute:check-circle-fill', 56)" style="display:contents; color: var(--bew-success-color);" />
          <h1 style="font-size: 1.25rem; color: var(--bew-text-1); font-weight: 700;" mt-4 mb-2>已登录洛谷</h1>
          <p text="sm $bew-text-3" mb-4>UID: {{ uid }}</p>
          <img
            :src="`https://cdn.luogu.com.cn/upload/usericon/${uid}.png`"
            w="48px" h="48px" rounded-full object-cover bg="$bew-fill-2"
            @error="(e) => { (e.target as HTMLImageElement).style.display = 'none' }"
          >
          <div flex="~ gap-3" mt-6>
            <Button type="secondary" @click="refreshPage">
              <span v-html="renderIcon('mingcute:refresh-line', 16)" style="display:contents" /> 刷新状态
            </Button>
            <Button type="primary" @click="doLogin">
              <span v-html="renderIcon('mingcute:user-4-line', 16)" style="display:contents" /> 切换账号
            </Button>
          </div>
        </template>

        <template v-else>
          <span v-html="renderIcon('mingcute:user-4-line', 48)" style="display:contents; color: var(--bew-text-3);" />
          <h1 style="font-size: 1.25rem; color: var(--bew-text-1); font-weight: 700;" mt-4 mb-2>登录洛谷</h1>
          <p style="font-size: 0.875rem; color: var(--bew-text-2);" mb-6>
            将跳转到洛谷官方登录页面（含验证码/CAPTCHA 支持）
          </p>
          <p style="font-size: 0.75rem; color: var(--bew-text-3);" mb-6>
            登录成功后会自动回到首页，GuluGulu 将接管并显示您的个人信息
          </p>
          <Button type="primary" block center @click="doLogin">
            <span v-html="renderIcon('mingcute:arrow-right-line', 16)" style="display:contents" />
            前往洛谷登录
          </Button>
          <p style="font-size: 0.75rem; color: var(--bew-text-4);" mt-4>
            我们使用洛谷官方登录流程，确保您的账号安全
          </p>
        </template>
      </div>
    </Transition>
  </div>
</template>
