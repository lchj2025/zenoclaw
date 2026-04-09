import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { spawn } from 'child_process'
import fs from 'fs'
import { getLogger } from './logger.js'
import { cfg } from './config.js'
import { gaussianRandom } from './human.js'

puppeteer.use(StealthPlugin())

// ============================================================
// 浏览器操作互斥锁
// 同一时间只允许一个任务操作浏览器，后续请求排队等待
// ============================================================
let _browserLockQueue = Promise.resolve()

/**
 * 获取浏览器操作锁
 * 返回一个 release 函数，任务完成后必须调用以释放锁
 *
 * 用法：
 *   const release = await acquireBrowserLock()
 *   try {
 *     const { browser, page } = await getBrowser()
 *     // ... 执行操作 ...
 *   } finally {
 *     release()
 *   }
 */
export function acquireBrowserLock() {
  let _release
  const waitPromise = new Promise(resolve => { _release = resolve })
  const ready = _browserLockQueue
  _browserLockQueue = _browserLockQueue.then(() => waitPromise)
  return ready.then(() => _release)
}

/**
 * 获取浏览器连接
 *
 * 优先连接已运行的 Chrome（通过 remote debugging port），
 * 如果 Chrome 未运行则自动启动。
 * 操作在新标签页中进行，不影响用户已打开的页面。
 *
 * ⚠️ 多个任务并发时，请先调用 acquireBrowserLock() 获取锁
 *
 * 配置项:
 *   browser.debug_port          — 调试端口
 *   browser.element_timeout     — 元素等待超时
 *   browser.navigation_timeout  — 导航超时
 *   browser.startup_timeout     — Chrome 启动超时
 *   stealth.random_viewport     — 是否随机化视口大小
 *   stealth.viewport_width/height_min/max — 视口范围
 *   stealth.disable_webrtc      — 是否禁用 WebRTC
 *
 * @returns {Promise<{browser: Browser, page: Page, isNewLaunch: boolean}>}
 */
export async function getBrowser() {
  const log = getLogger()
  const debugPort = cfg('browser.debug_port', 9222)

  // 第一步：尝试连接已运行的 Chrome
  const existing = await tryConnectExisting(debugPort, log)
  if (existing) {
    log.info('已连接到当前运行的 Chrome 浏览器')
    const page = await createConfiguredPage(existing, log)
    return { browser: existing, page, isNewLaunch: false }
  }

  // 第二步：Chrome 未运行或未开启调试端口 → 自动启动
  log.info('未检测到可连接的 Chrome，正在启动...')
  const browser = await launchChromeWithDebug(debugPort, log)
  const page = await createConfiguredPage(browser, log)

  return { browser, page, isNewLaunch: true }
}

/**
 * 创建一个配置好的新标签页
 * 应用超时、视口随机化、WebRTC 防护等
 */
async function createConfiguredPage(browser, log) {
  const page = await browser.newPage()

  // 超时设置
  const elementTimeout = cfg('browser.element_timeout', 30000)
  const navTimeout     = cfg('browser.navigation_timeout', 60000)
  page.setDefaultTimeout(elementTimeout)
  page.setDefaultNavigationTimeout(navTimeout)

  // 视口随机化
  if (cfg('stealth.random_viewport', true)) {
    const w = Math.floor(gaussianRandom(
      cfg('stealth.viewport_width_min', 1200),
      cfg('stealth.viewport_width_max', 1920)
    ))
    const h = Math.floor(gaussianRandom(
      cfg('stealth.viewport_height_min', 800),
      cfg('stealth.viewport_height_max', 1080)
    ))
    await page.setViewport({ width: w, height: h })
    log.debug(`视口大小: ${w}x${h}`)
  }

  // WebRTC 防泄露
  if (cfg('stealth.disable_webrtc', true)) {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        get: () => ({ getUserMedia: () => Promise.reject(new Error('blocked')) })
      })
      window.RTCPeerConnection = undefined
      window.webkitRTCPeerConnection = undefined
    })
    log.debug('WebRTC 已禁用')
  }

  return page
}

/**
 * 尝试连接已运行的 Chrome（通过 remote debugging port）
 */
async function tryConnectExisting(debugPort, log) {
  try {
    const resp = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
    if (!resp.ok) return null

    const data = await resp.json()
    const wsUrl = data.webSocketDebuggerUrl
    if (!wsUrl) return null

    log.debug(`发现 Chrome 调试端口 ws: ${wsUrl}`)
    const browser = await puppeteer.connect({
      browserWSEndpoint: wsUrl,
      defaultViewport: null
    })
    return browser
  } catch {
    return null
  }
}

/**
 * 启动 Chrome 并开启 remote debugging
 *
 * 这种方式启动的 Chrome 和你平时手动打开的完全一样：
 * - 加载你的 Profile（登录态、历史记录、书签全部在）
 * - 开启调试端口供程序连接
 * - 用户可以正常手动使用这个浏览器
 *
 * 配置项:
 *   browser.chrome_user_data — 用户数据目录（必填）
 *   browser.profile          — Profile 名称
 *   browser.chrome_path      — Chrome 可执行文件路径
 *   browser.startup_timeout  — 启动超时
 */
async function launchChromeWithDebug(debugPort, log) {
  const userDataDir = cfg('browser.chrome_user_data', '')
  if (!userDataDir) {
    throw new Error(
      'config.yaml 中 browser.chrome_user_data 未配置\n' +
      '请在 Chrome 地址栏输入 chrome://version 查找 Profile 路径'
    )
  }

  const profileDir = cfg('browser.profile', 'Default')
  const chromePath = cfg('browser.chrome_path', '') || findChromePath()

  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars'
  ]

  log.info(`启动 Chrome: ${chromePath}`)
  log.info(`Profile: ${profileDir}, 调试端口: ${debugPort}`)

  // 后台启动 Chrome 进程（不阻塞）
  const chromeProcess = spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore'
  })
  chromeProcess.unref()

  // 等待 Chrome 调试端口就绪
  const startupTimeout = cfg('browser.startup_timeout', 30000)
  log.info('等待 Chrome 启动...')
  const browser = await waitForDebugPort(debugPort, startupTimeout)

  if (!browser) {
    throw new Error(`Chrome 启动超时，请检查 chrome_path 配置是否正确: ${chromePath}`)
  }

  log.info('Chrome 启动成功')
  return browser
}

/**
 * 轮询等待 Chrome 调试端口就绪
 */
async function waitForDebugPort(port, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (resp.ok) {
        const data = await resp.json()
        const wsUrl = data.webSocketDebuggerUrl
        if (wsUrl) {
          const browser = await puppeteer.connect({
            browserWSEndpoint: wsUrl,
            defaultViewport: null
          })
          return browser
        }
      }
    } catch {
      // Chrome 还没准备好，继续等
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return null
}

/**
 * 自动查找 Chrome 可执行文件路径
 */
function findChromePath() {
  const platform = process.platform

  const paths = {
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser'
    ]
  }

  const candidates = paths[platform] || []
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {
      continue
    }
  }

  throw new Error(
    '未找到 Chrome，请在 config.yaml 中手动配置 browser.chrome_path\n' +
    `当前系统: ${platform}`
  )
}

/**
 * 关闭标签页（不关闭浏览器）
 * 操作完成后只关闭我们打开的标签页，用户的其他标签页不受影响
 */
export async function closePage(page) {
  const log = getLogger()
  try {
    if (page && !page.isClosed()) {
      await page.close()
      log.info('标签页已关闭')
    }
  } catch (err) {
    log.warn(`关闭标签页时出错: ${err.message}`)
  }
}

/**
 * 断开与浏览器的连接（不关闭浏览器）
 * 程序退出时调用，Chrome 继续运行
 */
export async function disconnectBrowser(browser) {
  const log = getLogger()
  try {
    if (browser) {
      browser.disconnect()
      log.info('已断开与 Chrome 的连接（浏览器保持运行）')
    }
  } catch (err) {
    log.warn(`断开连接时出错: ${err.message}`)
  }
}

/**
 * 强制关闭浏览器（一般不用，仅测试时使用）
 */
export async function closeBrowser(browser) {
  const log = getLogger()
  try {
    if (browser) {
      await browser.close()
      log.info('Chrome 已关闭')
    }
  } catch (err) {
    log.warn(`关闭浏览器时出错: ${err.message}`)
  }
}
