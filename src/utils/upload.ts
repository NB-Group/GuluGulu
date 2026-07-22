/* eslint-disable style/max-statements-per-line */
// Luogu 图片上传工具(通用)。
//
// 洛谷图片上传分三步且强制图形验证码(2026-07 抓包确认):
//   1. 取验证码图片:GET https://www.luogu.com.cn/lg4/captcha?_t=<nonce>
//      (必须是 /lg4/captcha —— 旧 /api/verify/captcha 是另一套 session)
//   2. 换 OSS 上传凭证:GET /api/image/generateUploadLink?type=<avatar|image_hosting>&watermarkType=<0|1>&captcha=<用户输入>
//      headers 带 X-Requested-With: XMLHttpRequest。返回 { uploadLink: { host, policy, accessKeyID, callback, signature, dir, expiredTime, _extra } }
//   3. POST multipart/form-data 到 uploadLink.host,字段见下方 buildOssForm。
//      OSS 的 callback body 会带最终 filename,据此拼出公开 CDN URL。
//
// 注意 dir 形如 "upload/image_hosting/__upload/{uid}/",而公开 CDN 路径是
// "upload/image_hosting/{object 名去掉 __upload/ 前缀}"。最稳妥是解析 OSS 响应
// JSON 的 filename 字段;拿不到则用提交的 key 反推。

import { getCsrfToken } from './luogu-api'

/** 验证码图片 URL(每次调用返回新的 nonce,带缓存破坏)。 */
export function captchaImageUrl(): string {
  return `https://www.luogu.com.cn/lg4/captcha?_t=${Date.now() + Math.random()}`
}

export type UploadType = 'avatar' | 'image_hosting'

interface OssUploadLink {
  host: string
  policy: string
  accessKeyID: string
  callback: string
  signature: string
  dir: string
  expiredTime?: number
  _extra?: Record<string, string>
}

interface GenerateLinkResponse {
  uploadLink?: OssUploadLink
  errorMessage?: string
  data?: any
}

/**
 * Step 2: 用验证码换 OSS 上传凭证。
 * 失败时抛出带可读文案的 Error。
 */
export async function fetchOssUploadLink(
  type: UploadType,
  captcha: string,
  watermarkType: 0 | 1 = 0,
): Promise<OssUploadLink> {
  const url = new URL('https://www.luogu.com.cn/api/image/generateUploadLink')
  url.searchParams.set('type', type)
  url.searchParams.set('watermarkType', String(watermarkType))
  url.searchParams.set('captcha', captcha)

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    credentials: 'same-origin',
  })

  const text = await res.text()
  let json: GenerateLinkResponse
  try { json = JSON.parse(text) }
  catch {
    throw new Error('上传凭证返回了非预期的响应,请稍后重试')
  }

  if (!json.uploadLink) {
    const msg = json.errorMessage || json.data?.errorMessage || json.data || '获取上传凭证失败(验证码错误或已过期)'
    throw new Error(typeof msg === 'string' ? msg : '获取上传凭证失败')
  }
  return json.uploadLink
}

/** 生成随机串(用于 OSS object key)。 */
function randomKey(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 36).toString(36)).join('')
}

function fileExtension(file: File): string {
  const m = file.name.match(/\.([a-z0-9]+)$/i)
  if (m?.[1])
    return m[1].toLowerCase()
  // fallback to mime subtype
  const mime = file.type.split('/')[1]
  return mime || 'png'
}

/**
 * 把 OSS 返回的 filename / key 解析成公开 CDN URL。
 * - dir = "upload/image_hosting/__upload/{uid}/"
 * - key  = `${dir}${rand}.${ext}` → object 名为 `${rand}.${ext}`
 * - 公开 URL = `https://cdn.luogu.com.cn/upload/image_hosting/${rand}.${ext}`
 */
function resolveCdnUrl(filename: string | undefined, key: string, dir: string, type: UploadType): string {
  let objectName: string
  if (filename) {
    // OSS callback 的 filename 可能是完整 key 或 object 名;统一取最后一段。
    objectName = filename.split('/').pop() || ''
  }
  else {
    // 从 key 里去掉 dir 前缀,得到 object 名
    objectName = key.startsWith(dir) ? key.slice(dir.length) : key.split('/').pop() || ''
  }
  if (!objectName) {
    // 兜底:直接用 key(虽然可能带 __upload/ 导致 URL 失效,但至少能回显给用户判断)
    return key
  }
  // 公开 CDN 路径:upload/image_hosting/{object} 或 upload/usericon/{object}(头像另算)
  const base = type === 'avatar' ? 'upload/usericon' : 'upload/image_hosting'
  return `https://cdn.luogu.com.cn/${base}/${objectName}`
}

/**
 * Step 3: 把文件 POST 到 OSS host(multipart/form-data),返回 OSS callback body。
 */
async function postToOss(link: OssUploadLink, file: File, uid: number): Promise<string> {
  const ext = fileExtension(file)
  const key = `${link.dir}${randomKey()}.${ext}`

  const form = new FormData()
  form.append('key', key)
  form.append('policy', link.policy)
  form.append('OSSAccessKeyId', link.accessKeyID)
  form.append('signature', link.signature)
  form.append('callback', link.callback)
  // _extra 里的 meta 字段单独提交为顶层表单字段
  form.append('x-oss-meta-luogu-uid', String(uid))
  form.append('x-oss-object-acl', 'private')
  form.append('success_action_status', '200')
  form.append('file', file)

  const res = await fetch(link.host, {
    method: 'POST',
    body: form,
    // 不要手动设 Content-Type —— 浏览器会自动加 multipart boundary
  })

  if (!res.ok && res.status !== 200) {
    throw new Error(`OSS 上传失败 (HTTP ${res.status})`)
  }

  const text = await res.text()
  let ossResp: any = {}
  try { ossResp = JSON.parse(text) }
  catch { /* OSS 可能返回非 JSON,继续走 key 推导 */ }

  // OSS callback body 里一般有 filename / url / size 等
  const filename: string | undefined = ossResp?.filename || ossResp?.data?.filename
  return resolveCdnUrl(filename, key, link.dir, 'image_hosting')
}

/**
 * 一键上传图片到洛谷 OSS,返回最终公开 CDN URL。
 *
 * @param file 要上传的图片文件
 * @param type 'avatar' | 'image_hosting'
 * @param captcha 用户输入的图形验证码(必填)
 * @param uid 当前用户 uid(用于 OSS meta)
 */
export async function uploadImage(
  file: File,
  type: UploadType,
  captcha: string,
  uid: number,
): Promise<string> {
  if (!captcha?.trim())
    throw new Error('请先输入图形验证码')
  if (!uid)
    throw new Error('未获取到用户 uid,请先登录')

  // Step 2: 换 OSS 凭证(验证码在这一步校验)
  const link = await fetchOssUploadLink(type, captcha.trim())

  // Step 3: POST 到 OSS
  const url = await postToOss(link, file, uid)
  return url
}

/**
 * 上传头像并(尝试)通过 POST /api/user/{uid} 设置为当前头像。
 * 设头像端点未完全确认,best-effort:失败时只返回上传得到的 URL,不抛错。
 */
export async function uploadAndSetAvatar(
  file: File,
  captcha: string,
  uid: number,
): Promise<{ url: string, setOk: boolean, setMessage: string }> {
  const url = await uploadImage(file, 'avatar', captcha, uid)

  // best-effort 设头像
  let setOk = false
  let setMessage = '上传成功,但自动设为头像的端点未确认,请到洛谷原站手动设置'
  try {
    const res = await fetch(`https://www.luogu.com.cn/api/user/${uid}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': getCsrfToken(),
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ avatar: url }),
    })
    const text = await res.text()
    let json: any = {}
    try { json = JSON.parse(text) }
    catch {}
    // 洛谷成功常返回 {_empty:true} 或 {data:null} 这类;失败一般带 errorMessage
    if (json?.errorMessage) {
      setMessage = `上传成功,但设头像失败:${json.errorMessage}`
    }
    else {
      setOk = true
      setMessage = '头像已更新'
    }
  }
  catch (e: any) {
    setMessage = `上传成功,但设头像请求失败:${e?.message || e}`
  }
  return { url, setOk, setMessage }
}
