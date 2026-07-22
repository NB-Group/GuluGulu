<script setup lang="ts">
import CheckInCalendar from './CheckInCalendar.vue'
import ProblemJumper from './ProblemJumper.vue'
import { renderIcon } from '~/utils/icons'

const announcements = [
  { title: '洛谷新用户必读', url: 'https://www.luogu.com.cn/discuss/241461' },
  { title: '洛谷主题库题目规范', url: 'https://www.luogu.com.cn/discuss/174811' },
  { title: '公开比赛与官方比赛规范', url: 'https://www.luogu.com.cn/discuss/174936' },
  { title: '题解审核及反馈要求', url: 'https://www.luogu.com.cn/discuss/174934' },
  { title: '洛谷讨论区规范', url: 'https://www.luogu.com.cn/discuss/152590' },
  { title: '管理员名单', url: 'https://www.luogu.com.cn/discuss/327478' },
  { title: '评测机语言环境信息', url: 'https://www.luogu.com.cn/discuss/86673' },
]

const links = {
  problemBanks: [
    { name: 'LibreOJ', url: 'https://loj.ac/' },
    { name: 'Vijos', url: 'https://vijos.org/' },
    { name: 'HydroOJ', url: 'https://hydro.ac/' },
  ],
  openSource: [
    { name: 'CYaRon 测试数据生成器', url: 'https://www.luogu.com.cn/discuss/11410' },
    { name: 'Markdown Palettes', url: 'https://github.com/luogu-dev/markdown-palettes' },
  ],
  services: [
    { name: '《深入浅出程序设计竞赛》', url: 'https://www.luogu.com.cn/discuss/273220' },
    { name: '洛谷网校', url: 'https://class.luogu.com.cn' },
  ],
}
</script>

<template>
  <aside style="display:flex;flex-direction:column;gap:16px;">
    <CheckInCalendar />
    <ProblemJumper />

    <!-- 本站公告 -->
    <div class="side-card">
      <h3 class="side-title">
        <span v-html="renderIcon('mingcute:notification-line', 16)" class="side-title-icon" />
        本站公告
      </h3>
      <div style="display:flex;flex-direction:column;gap:2px;">
        <a
          v-for="item in announcements"
          :key="item.url"
          :href="item.url"
          target="_blank"
          class="side-link"
        >{{ item.title }}</a>
      </div>
    </div>

    <!-- 友情链接 -->
    <div class="side-card">
      <h3 class="side-title">
        <span v-html="renderIcon('mingcute:link-2-line', 16)" class="side-title-icon" />
        友情链接
      </h3>

      <div style="margin-bottom:12px;">
        <p class="side-subtitle">推荐题库</p>
        <div style="display:flex;flex-wrap:wrap;gap:4px 8px;">
          <a
            v-for="link in links.problemBanks"
            :key="link.name"
            :href="link.url"
            target="_blank"
            class="side-link"
          >{{ link.name }}</a>
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <p class="side-subtitle">开源项目</p>
        <div style="display:flex;flex-direction:column;gap:2px;">
          <a
            v-for="link in links.openSource"
            :key="link.name"
            :href="link.url"
            target="_blank"
            class="side-link"
          >{{ link.name }}</a>
        </div>
      </div>

      <div>
        <p class="side-subtitle">洛谷服务</p>
        <div style="display:flex;flex-direction:column;gap:2px;">
          <a
            v-for="link in links.services"
            :key="link.name"
            :href="link.url"
            target="_blank"
            class="side-link"
          >{{ link.name }}</a>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.side-card {
  background: var(--bew-content);
  backdrop-filter: var(--bew-filter-glass-1);
  border-radius: 12px;
  border: 1px solid var(--bew-border-color);
  box-shadow: var(--bew-shadow-1), var(--bew-shadow-edge-glow-1);
  padding: 16px;
}
.side-title {
  font-size: var(--bew-base-font-size);
  font-weight: 700;
  color: var(--bew-text-1);
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.side-title-icon {
  display: inline-flex;
  color: var(--bew-theme-color);
  flex-shrink: 0;
}
.side-title-icon :deep(svg) {
  display: block;
}
.side-subtitle {
  font-size: calc(var(--bew-base-font-size) * 0.85);
  font-weight: 700;
  color: var(--bew-text-3);
  margin: 0 0 4px 0;
}
.side-link {
  font-size: calc(var(--bew-base-font-size) * 0.85);
  color: var(--bew-text-2);
  text-decoration: none;
  padding: 4px 0;
  display: block;
  transition: color var(--bew-dur-fast);
}
.side-link:hover {
  color: var(--bew-theme-color);
  text-decoration: underline;
}
</style>
