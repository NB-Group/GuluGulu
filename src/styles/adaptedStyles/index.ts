import './common'
import './shadowDom'

async function setupStyles() {
  const currentUrl = document.URL

  // Login / Auth pages — style only
  if (/https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?\/auth\/login/.test(currentUrl)
    || /https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?\/auth\/register/.test(currentUrl)
    || /https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?\/openid\//.test(currentUrl)
  ) {
    await import('./pages/loginPage.scss')
    document.documentElement.classList.add('loginPage')
  }
  // Homepage 首页
  else if (
    /https?:\/\/(?:www\.)?luogu\.com\.cn\/?(?:#\/?)?$/.test(currentUrl)
    || /https?:\/\/(?:www\.)?luogu\.com\/?(?:#\/?)?$/.test(currentUrl)
    || /https?:\/\/(?:www\.)?luogu\.org\/?(?:#\/?)?$/.test(currentUrl)
    || /https?:\/\/(?:www\.)?luogu\.com\.cn\/index\.html$/.test(currentUrl)
    || /https?:\/\/(?:www\.)?luogu\.com\.cn\/\?/.test(currentUrl)
  ) {
    await import('./pages/homePage.scss')
    document.documentElement.classList.add('homePage')
  }
  // Problem pages 题目页
  else if (/https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?\/problem/.test(currentUrl)) {
    await import('./pages/problemPage.scss')
    document.documentElement.classList.add('problemPage')
  }
  // Blog / Discuss 博客/讨论页
  else if (/https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?\/(?:blog|discuss)/.test(currentUrl)) {
    await import('./pages/articlesPage.scss')
    document.documentElement.classList.add('articlesPage')
  }
  // User space 用户空间页
  else if (/https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?\/(?:user|space)/.test(currentUrl)) {
    await import('./pages/userSpacePage.scss')
    document.documentElement.classList.add('userSpacePage')
  }
  // Search page 搜索页
  else if (
    /https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?\/search/.test(currentUrl)
    || /https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?\/problem\/keyword/.test(currentUrl)
  ) {
    await import('./pages/searchPage.scss')
    document.documentElement.classList.add('searchPage')
  }
  // Ranking page 排名页
  else if (/https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?\/ranking/.test(currentUrl)) {
    await import('./pages/searchPage.scss')
    document.documentElement.classList.add('searchPage')
  }
  // Contest pages 比赛页
  else if (/https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?\/contest/.test(currentUrl)) {
    await import('./pages/searchPage.scss')
    document.documentElement.classList.add('searchPage')
  }
  // Training / Team / Record pages
  else if (/https?:\/\/(?:www\.)?luogu\.com(?:\.cn)?\/(?:training|team|record)/.test(currentUrl)) {
    await import('./pages/searchPage.scss')
    document.documentElement.classList.add('searchPage')
  }
}

setupStyles()
