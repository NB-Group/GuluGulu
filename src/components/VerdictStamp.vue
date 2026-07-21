<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useGulyApp } from '~/composables/useAppProvider'
import type { VerdictResult } from '~/utils/luogu-api'
import { AppPage } from '~/enums/appEnums'

const props = defineProps<{ result: VerdictResult | null }>()
const emit = defineEmits<{ dismiss: [] }>()
const { mainAppRef, navigateTo } = useGulyApp()

// 查看记录:in-SPA 跳转到 Record 页(而非 target=_blank 开新标签,后者体验割裂)
function viewRecord() {
  if (props.result?.rid != null) {
    navigateTo(AppPage.Record, `https://www.luogu.com.cn/record/${props.result.rid}`)
    emit('dismiss')
  }
}

interface Meta { color: string, label: string, celebrate?: boolean }
const META: Record<string, Meta> = {
  AC: { color: '#2faa4a', label: 'ACCEPTED', celebrate: true },
  WA: { color: '#d4332b', label: 'WRONG ANSWER' },
  TLE: { color: '#d4332b', label: 'TIME LIMIT' },
  MLE: { color: '#d4332b', label: 'MEMORY LIMIT' },
  RE: { color: '#d4332b', label: 'RUNTIME ERROR' },
  CE: { color: '#d97706', label: 'COMPILE ERROR' },
  OLE: { color: '#d4332b', label: 'OUTPUT LIMIT' },
  UKE: { color: '#6b7280', label: 'UNKNOWN ERROR' },
  Unknown: { color: '#6b7280', label: '未通过' },
}
const meta = computed<Meta>(() => (props.result && META[props.result.verdict]) || META.Unknown)

const reduced = ref(false)
const celebrate = ref(false)
const showCompile = ref(false)
const stampSeed = ref(7)
const stampTilt = ref(-8)
let dismissTimer: ReturnType<typeof setTimeout> | null = null
onKeyStroke('Escape', () => emit('dismiss'))

function fmt(v: number | null, isTime: boolean): string {
  if (v == null) return ''
  return isTime ? (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v}ms`) : (v >= 1024 ? `${(v / 1024).toFixed(2)}MB` : `${v}KB`)
}
function particleStyle(i: number) {
  const angle = (i / 20) * Math.PI * 2 + (i % 3) * 0.4
  const dist = 90 + (i % 5) * 18
  const size = 3 + (i % 4) * 3
  return {
    '--px': `${Math.round(Math.cos(angle) * dist)}px`,
    '--py': `${Math.round(Math.sin(angle) * dist)}px`,
    width: `${size}px`,
    height: `${size}px`,
    animationDelay: `${i * 14}ms`,
  }
}

watch(() => props.result, (r) => {
  if (!r) { celebrate.value = false; showCompile.value = false; return }
  // each press is slightly different: ink-texture seed + resting tilt
  stampSeed.value = Math.floor(Math.random() * 1000)
  stampTilt.value = -8 + (Math.random() * 6 - 3)
  if (r.state === 'done' && r.verdict === 'AC' && !reduced.value) {
    celebrate.value = true
    setTimeout(() => { celebrate.value = false }, 2100)
  }
  if (dismissTimer) clearTimeout(dismissTimer)
  const ttl = r.verdict === 'AC' ? 10000 : 7000
  dismissTimer = setTimeout(() => emit('dismiss'), ttl)
}, { immediate: true })

onBeforeUnmount(() => { if (dismissTimer) clearTimeout(dismissTimer) })
reduced.value = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
</script>

<template>
  <Teleport :to="mainAppRef || 'body'">
    <div
      v-if="result" class="vs-overlay" pos="fixed top-0 left-0" w-full h-full z-10002
      flex="~ items-center justify-center" @click.self="emit('dismiss')"
    >
      <div v-if="celebrate && !reduced" class="vs-flash" :style="{ '--ink': meta.color }" />

      <div class="vs-doc" :style="{ '--ink': meta.color }">
        <!-- THE SEAL -->
        <div class="vs-seal-wrap" :class="{ 'vs-slam': !reduced, celebrate }" :style="{ '--tilt': stampTilt + 'deg' }">
          <svg class="vs-seal" viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <filter id="vsInk" x="-12%" y="-12%" width="124%" height="124%">
                <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" :seed="stampSeed" result="n" />
                <feDisplacementMap in="SourceGraphic" in2="n" scale="3" />
              </filter>
              <path id="vsArcTop" d="M 36 100 A 64 64 0 0 1 164 100" fill="none" />
            </defs>
            <g filter="url(#vsInk)" :style="{ color: meta.color }">
              <!-- outer + inner rings -->
              <circle cx="100" cy="100" r="91" fill="none" stroke="currentColor" stroke-width="6" />
              <circle cx="100" cy="100" r="83" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.7" />
              <circle cx="100" cy="100" r="77" fill="none" stroke="currentColor" stroke-width="1.8" />
              <!-- 36 ticks around the rim -->
              <line v-for="i in 36" :key="'t' + i" x1="100" y1="12" x2="100" y2="18"
                :transform="`rotate(${(i - 1) * 10} 100 100)`" stroke="currentColor" stroke-width="1.4" />
              <!-- curved top text -->
              <text class="vs-arc"><textPath href="#vsArcTop" startOffset="50%" text-anchor="middle">✦ LUOGU 评测系统 ✦</textPath></text>
              <!-- side accent dots -->
              <circle cx="22" cy="100" r="2.6" fill="currentColor" />
              <circle cx="178" cy="100" r="2.6" fill="currentColor" />
              <!-- inner ring around center -->
              <circle cx="100" cy="100" r="50" fill="none" stroke="currentColor" stroke-width="1.6" />
              <!-- verdict + divider + label -->
              <text x="100" y="92" text-anchor="middle" dominant-baseline="central" class="vs-seal-v" fill="currentColor">{{ result.verdict }}</text>
              <line x1="70" y1="112" x2="130" y2="112" stroke="currentColor" stroke-width="1.4" />
              <text x="100" y="126" text-anchor="middle" class="vs-seal-l" fill="currentColor">{{ meta.label }}</text>
            </g>
          </svg>
          <div v-if="celebrate" class="vs-splat">
            <span v-for="i in 20" :key="i" :style="particleStyle(i)" />
          </div>
        </div>

        <!-- the "paper" -->
        <div class="vs-info">
          <div v-if="result.score != null || result.time != null || result.memory != null" class="vs-metric">
            <span v-if="result.score != null">{{ result.score }} 分</span>
            <span v-if="result.time != null">{{ fmt(result.time, true) }}</span>
            <span v-if="result.memory != null">{{ fmt(result.memory, false) }}</span>
          </div>
          <div class="vs-summary">{{ result.summary }}</div>
          <template v-if="result.verdict === 'CE' && result.compileMessage">
            <button class="vs-toggle" @click="showCompile = !showCompile">
              {{ showCompile ? '收起报错' : '查看编译报错' }}
            </button>
            <pre v-if="showCompile" class="vs-ce">{{ result.compileMessage }}</pre>
          </template>
          <button class="vs-link" @click="viewRecord">
            查看记录 #{{ result.rid }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.vs-overlay { background: rgba(0, 0, 0, 0.36); backdrop-filter: blur(3px); animation: vsFade 0.25s ease; }
.vs-doc {
  position: relative;
  width: 360px;
  margin-top: 30px;
  padding: 226px 28px 24px;
  border-radius: 18px;
  background: var(--bew-bg);
  border: 1px solid var(--bew-border-color);
  box-shadow: 0 26px 78px rgba(0, 0, 0, 0.45);
  text-align: center;
  animation: vsDocIn 0.5s cubic-bezier(0.2, 0.8, 0.3, 1.05);
}
.vs-seal-wrap {
  position: absolute;
  top: 18px;
  left: 50%;
  width: 200px;
  height: 200px;
  transform: translateX(-50%) rotate(var(--tilt, -8deg));
  transform-origin: 50% 50%;
}
.vs-slam { animation: vsSlam 1s cubic-bezier(0.34, 0.12, 0.3, 1); }
.vs-seal { width: 100%; height: 100%; display: block; opacity: 0.93; }
.vs-seal-v { font-size: 52px; font-weight: 900; letter-spacing: 1px; font-family: 'Arial Black', 'Helvetica', sans-serif; }
.vs-seal-l { font-size: 10px; font-weight: 800; letter-spacing: 2px; }
.vs-arc { font-size: 9.5px; font-weight: 800; letter-spacing: 1.5px; }

.vs-info { margin-top: 4px; }
.vs-metric { display: flex; gap: 14px; justify-content: center; font-size: 14px; font-weight: 700; color: var(--bew-text-1); font-variant-numeric: tabular-nums; }
.vs-summary { margin-top: 6px; font-size: 12px; color: var(--bew-text-3); }
.vs-toggle { margin-top: 12px; font-size: 12px; color: var(--bew-theme-color); background: transparent; border: none; cursor: pointer; }
.vs-ce { margin-top: 8px; padding: 10px; max-height: 160px; overflow: auto; background: var(--bew-fill-1); border-radius: 8px; font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 11.5px; line-height: 1.5; color: var(--bew-text-2); text-align: left; white-space: pre-wrap; word-break: break-word; }
.vs-link { display: inline-block; margin-top: 14px; font-size: 12px; color: var(--bew-text-3); text-decoration: none; border: none; background: transparent; cursor: pointer; font: inherit; }
.vs-link:hover { color: var(--bew-theme-color); }

.vs-splat { position: absolute; inset: 0; pointer-events: none; }
.vs-splat span { position: absolute; left: 50%; top: 50%; background: var(--ink); border-radius: 42% 58% 53% 47% / 47% 53% 47% 53%; animation: vsSplat 1.3s ease-out forwards; }
.vs-flash { position: fixed; left: 50%; top: 50%; width: 560px; height: 560px; margin: -280px 0 0 -280px; border-radius: 50%; background: radial-gradient(circle, var(--ink), transparent 60%); opacity: 0; animation: vsFlash 1.1s ease-out forwards; pointer-events: none; }

@keyframes vsFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes vsDocIn { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
@keyframes vsSlam {
  0%   { opacity: 0; transform: translateX(-50%) rotate(-26deg) scale(2.1); }
  28%  { opacity: 1; transform: translateX(-50%) rotate(-6deg) scale(1.07); }
  44%  { transform: translateX(-50%) rotate(-11deg) scale(0.92); }
  62%  { transform: translateX(-50%) rotate(-5.5deg) scale(1.04); }
  80%  { transform: translateX(-50%) rotate(-9.5deg) scale(0.99); }
  100% { opacity: 1; transform: translateX(-50%) rotate(var(--tilt, -8deg)) scale(1); }
}
@keyframes vsSplat {
  0%   { transform: translate(-50%, -50%) scale(1); opacity: 0.95; }
  100% { transform: translate(calc(-50% + var(--px)), calc(-50% + var(--py))) scale(0); opacity: 0; }
}
@keyframes vsFlash { 0% { opacity: 0.55 } 100% { opacity: 0 } }
@media (prefers-reduced-motion: reduce) {
  .vs-slam { animation: vsFade 0.3s ease; }
  .vs-splat, .vs-flash { display: none; }
}
</style>
