# 本次更新

## Bug 修复
### 讨论回复验证码死循环
端点 `/api/verify/captcha` → `/lg4/captcha`;captcha 放 body `{captcha,content}` 而非 `X-Captcha` 头
### 主题切换动画 Chromium 偏移
按浏览器品牌区分 dpr 补偿(Chrome/Edge 用,纯 Chromium 不用)
### 专栏点赞 404
`vote` 改为 query 参数(`?vote=1/-1/0`)

## 新功能
### 专栏 Article 全功能
列表/分类/详情 markdown/赞踩收藏/评论/dock 入口
### 个人主页嵌套 tab
收藏(题单·专栏)、比赛(参加·创建)、讨论、专栏
### 设置 / 编辑资料 + 图片上传
简介签名编辑、奖项、偏好、头像上传(OSS)
### 通知页
分类 tab、未读、滚动加载、链接拦截
### 随机题目
### 关注/取关按钮

## 编辑器:CodeMirror → Monaco
外部化加载、tree-sitter C++ 诊断、自动格式化、JetBrains Mono 等宽字体

## 体验
### 团队页 GitHub ORG 布局
### 空态淡入动画
### 图标补充(thumb-down / star)
