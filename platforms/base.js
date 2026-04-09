import fs from 'fs'
import path from 'path'
import { getLogger } from '../core/logger.js'
import { cfg } from '../core/config.js'
import { verifyPageContent } from '../core/vision-verify.js'
import { simulateIMEText, containsChinese } from '../core/ime-simulator.js'
import {
  createHumanCursor,
  humanClick,
  humanType,
  humanPaste,
  humanScroll,
  humanUploadFile,
  simulateBrowsing,
  randomDelay,
  calculateRemainingWait,
  gaussianRandom
} from '../core/human.js'

/**
 * 平台适配器基类
 * 所有平台适配器继承此类，实现 publish() 方法
 *
 * 配置节对应关系:
 *   导航行为      → config.browser.navigation_timeout, config.timing.post_navigation_delay_*
 *   操作间隔      → config.timing.action_delay_*
 *   总发帖时长    → config.timing.total_duration_*
 *   标签页关闭    → config.tab.*
 *   截图策略      → config.screenshot.*
 *   步骤浏览时间  → config.steps.*
 */
export class BasePlatformAdapter {
  constructor(page) {
    this.page = page
    this.cursor = null
    this.log = getLogger()
    this.startTime = null
  }

  /**
   * 初始化 cursor（需要在 page 准备好后调用）
   */
  async init() {
    this.cursor = await createHumanCursor(this.page)
    this.startTime = Date.now()
  }

  /**
   * 子类必须实现：执行发帖操作
   * @param {object} post - 帖子数据 { title, content, images, tags }
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async publish(post) {
    throw new Error('子类必须实现 publish() 方法')
  }

  // ============================================================
  // 平台元数据（子类可重写）
  // ============================================================

  /** 平台首页 URL（养号浏览用） */
  getHomeUrl() { return null }

  /** 平台登录 URL */
  getLoginUrl() { return null }

  /** 平台互动选择器（数组式 fallback 格式） */
  getInteractSelectors() { return null }

  /** 平台名称 */
  getPlatformName() { return this.platformName || 'unknown' }

  // ============================================================
  // 导航
  // ============================================================

  /**
   * 导航到指定 URL 并等待加载完成
   *
   * 配置项:
   *   browser.navigation_timeout          — 页面加载超时
   *   timing.post_navigation_delay_min/max — 加载后等待
   */
  async navigateTo(url) {
    this.log.info(`导航到: ${url}`)
    const navTimeout = cfg('browser.navigation_timeout', 60000)
    await this.page.goto(url, { waitUntil: 'networkidle2', timeout: navTimeout })

    const delayMin = cfg('timing.post_navigation_delay_min', 2000)
    const delayMax = cfg('timing.post_navigation_delay_max', 4000)
    await randomDelay(delayMin, delayMax)
    this.log.info('页面加载完成')
  }

  // ============================================================
  // 浏览模拟
  // ============================================================

  /**
   * 等待并模拟浏览（填充时间，让操作看起来像真人）
   * @param {number} minSeconds - 最短浏览时间（秒）
   * @param {number} maxSeconds - 最长浏览时间（秒）
   */
  async browseAround(minSeconds, maxSeconds) {
    const durationMs = Math.floor(
      gaussianRandom(minSeconds * 1000, maxSeconds * 1000)
    )
    await simulateBrowsing(this.page, this.cursor, durationMs)
  }

  /**
   * 按步骤名称读取配置的浏览时间并模拟浏览
   *
   * 配置项: steps.<stepName>.browse_min/max
   *
   * @param {string} stepName - 步骤名称（对应 config.steps 下的 key）
   */
  async browseForStep(stepName) {
    const browseMin = cfg(`steps.${stepName}.browse_min`, 60)
    const browseMax = cfg(`steps.${stepName}.browse_max`, 180)
    await this.browseAround(browseMin, browseMax)
  }

  // ============================================================
  // 操作间隔
  // ============================================================

  /**
   * 操作间的随机等待
   *
   * 配置项: timing.action_delay_min/max
   */
  async actionPause() {
    const delayMin = cfg('timing.action_delay_min', 3000)
    const delayMax = cfg('timing.action_delay_max', 15000)
    await randomDelay(delayMin, delayMax)
  }

  // ============================================================
  // 总时长补足
  // ============================================================

  /**
   * 在发帖流程最后，补足剩余时间以达到目标总时长
   *
   * 配置项: timing.total_duration_min/max
   */
  async fillRemainingTime() {
    if (!this.startTime) return

    const remaining = calculateRemainingWait(this.startTime)
    if (remaining > 5000) {
      this.log.info(`补足剩余时间: ${(remaining / 1000 / 60).toFixed(1)} 分钟`)
      await simulateBrowsing(this.page, this.cursor, remaining)
    }
  }

  // ============================================================
  // 发布后行为
  // ============================================================

  /**
   * 发帖前预热浏览：先导航到平台首页，模拟浏览 feed 一段时间
   * 让平台看到自然的「浏览→发帖」行为链，而非直接访问发帖页
   *
   * 配置项:
   *   timing.warmup_browse_enabled — 是否启用
   *   timing.warmup_browse_min/max — 预热浏览时间（秒）
   */
  async warmupBrowse() {
    const enabled = cfg('timing.warmup_browse_enabled', true)
    if (!enabled) {
      this.log.debug('预热浏览已禁用，跳过')
      return
    }

    const homeUrl = this.getHomeUrl?.()
    if (!homeUrl) {
      this.log.debug('平台未配置首页 URL，跳过预热浏览')
      return
    }

    const browseMin = cfg('timing.warmup_browse_min', 300)
    const browseMax = cfg('timing.warmup_browse_max', 900)
    const durationMs = Math.floor(gaussianRandom(browseMin * 1000, browseMax * 1000))

    this.log.info(`[预热浏览] 导航到首页: ${homeUrl}，浏览 ${Math.floor(durationMs / 1000)}s`)
    await this.navigateTo(homeUrl)
    await simulateBrowsing(this.page, this.cursor, durationMs)
    this.log.info('[预热浏览] 完成')
  }

  /**
   * 发布成功后，在页面上继续浏览一段时间再结束
   *
   * 配置项: tab.post_publish_browse_min/max
   */
  async postPublishBrowse() {
    const browseMin = cfg('tab.post_publish_browse_min', 30)
    const browseMax = cfg('tab.post_publish_browse_max', 120)
    if (browseMax > 0) {
      this.log.info('发布后继续浏览...')
      await this.browseAround(browseMin, browseMax)
    }
  }

  /**
   * 关闭标签页前的延迟等待
   *
   * 配置项: tab.close_delay_min/max
   */
  async preCloseDelay() {
    const delayMin = cfg('tab.close_delay_min', 3000)
    const delayMax = cfg('tab.close_delay_max', 15000)
    this.log.debug('关闭标签页前等待...')
    await randomDelay(delayMin, delayMax)
  }

  // ============================================================
  // 截图
  // ============================================================

  /**
   * 截图保存
   *
   * 配置项:
   *   screenshot.full_page — 是否截全页
   *   screenshot.save_dir  — 截图保存目录
   */
  async takeScreenshot(name) {
    const fullPage = cfg('screenshot.full_page', false)
    const saveDir  = cfg('screenshot.save_dir', './logs/screenshots')

    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true })
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(saveDir, `${name}_${timestamp}.png`)
    await this.page.screenshot({ path: filePath, fullPage })
    this.log.info(`截图已保存: ${filePath}`)
    return filePath
  }

  /**
   * 根据截图策略决定是否截图
   *
   * 配置项: screenshot.on_each_step / on_error / on_before_publish / on_after_publish
   *
   * @param {string} name - 截图名称
   * @param {string} trigger - 触发类型: 'step' | 'error' | 'before_publish' | 'after_publish'
   */
  async conditionalScreenshot(name, trigger) {
    const triggerMap = {
      step: 'screenshot.on_each_step',
      error: 'screenshot.on_error',
      before_publish: 'screenshot.on_before_publish',
      after_publish: 'screenshot.on_after_publish',
    }
    const configKey = triggerMap[trigger]
    if (configKey && cfg(configKey, trigger === 'error')) {
      return this.takeScreenshot(name)
    }
    return null
  }

  // ============================================================
  // 快捷封装，子类直接调用
  // ============================================================

  async click(selector) {
    return humanClick(this.cursor, selector, this.page)
  }

  async type(selector, text) {
    return humanType(this.page, selector, text, this.cursor)
  }

  /**
   * CDP insertText 输入（用于 contenteditable 富文本编辑器）
   * keyboard.type 对中文或 React/Vue 编辑器不可靠时使用此方法
   */
  async paste(selector, text) {
    return humanPaste(this.page, selector, text, this.cursor)
  }

  async scroll() {
    return humanScroll(this.page)
  }

  async uploadFile(selectorOrHandle, filePaths) {
    // 兼容两种调用模式：
    //   uploadFile('input[type=file]', [path])   — string selector（大多数平台）
    //   uploadFile(elementHandle, path)           — ElementHandle（抖音/视频号/头条）
    if (typeof selectorOrHandle === 'string') {
      return humanUploadFile(this.page, selectorOrHandle, filePaths)
    }

    // ElementHandle 模式：直接在已找到的元素上调用 uploadFile
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths]
    await selectorOrHandle.uploadFile(...paths)
    const waitMin = cfg('upload.wait_after_select_min', 2000)
    const waitMax = cfg('upload.wait_after_select_max', 5000)
    await randomDelay(waitMin, waitMax)
    this.log.info(`文件上传完成（ElementHandle 模式，${paths.length} 个文件）`)
  }

  /**
   * 从多个候选选择器中找到第一个存在于页面中的
   * @param {string[]} candidates - 候选 CSS 选择器列表（按优先级排列）
   * @returns {Promise<string>} 匹配到的选择器
   * @throws {Error} 全部未命中时抛出
   */
  async findSelector(candidates) {
    for (const selector of candidates) {
      try {
        const el = await this.page.$(selector)
        if (el) {
          this.log.debug(`使用选择器: ${selector}`)
          return selector
        }
      } catch {
        continue
      }
    }
    throw new Error(`未找到匹配的元素，候选选择器: ${candidates.join(', ')}`)
  }

  /**
   * 从多个候选选择器中找到第一个存在于页面中的，返回 ElementHandle
   * （findSelector 的 ElementHandle 版本，供 weibo/bilibili 等 publisher 使用）
   * @param {string[]} candidates - 候选 CSS 选择器列表
   * @returns {Promise<ElementHandle|null>} 命中的元素，全部未命中返回 null
   */
  async findElement(candidates) {
    for (const selector of candidates) {
      try {
        const el = await this.page.$(selector)
        if (el) {
          this.log.debug(`findElement 命中: ${selector}`)
          return el
        }
      } catch {
        continue
      }
    }
    this.log.warn(`findElement 未命中，候选: ${candidates.join(', ')}`)
    return null
  }

  /**
   * 通过文本内容查找按钮或元素（替代 Puppeteer 不支持的 :has-text()）
   * @param {string} tag - HTML 标签名（如 'button', 'a', 'span'）
   * @param {string} text - 要匹配的文本内容
   * @returns {Promise<ElementHandle|null>}
   */
  async findByText(tag, text) {
    const elements = await this.page.$$(tag)
    for (const el of elements) {
      const content = await el.evaluate(node => node.textContent.trim())
      if (content.includes(text)) return el
    }
    return null
  }

  // ============================================================
  // AI 视觉验证
  // ============================================================

  /**
   * 发布前 AI 视觉验证：截图当前页面，调用视觉模型确认内容已正确填写
   *
   * 配置项: vision.enabled / vision.api_key / vision.base_url / vision.model
   *
   * @param {object} expected - 期望内容 { title?, content?, tags?, imageCount? }
   * @returns {Promise<{pass: boolean, confidence: number, details: string, issues: string[]}>}
   */
  async verifyBeforePublish(expected) {
    return verifyPageContent(this.page, expected)
  }

  // ============================================================
  // 元素操作
  // ============================================================

  /**
   * 通过 ghost-cursor 点击 ElementHandle（保留鼠标移动轨迹）
   * cursor 不存在时 fallback 到原生 el.click()
   * @param {ElementHandle} el - 目标元素
   */
  async clickElement(el) {
    if (this.cursor) {
      const clickOffset  = cfg('mouse.click_offset_percent', 10)
      const clickWaitMin = cfg('mouse.click_wait_min', 50)
      const clickWaitMax = cfg('mouse.click_wait_max', 200)
      await this.cursor.click(el, {
        paddingPercentage: clickOffset,
        waitForClick: Math.floor(gaussianRandom(clickWaitMin, clickWaitMax))
      })
    } else {
      await el.click()
    }
  }

  async clickByText(tag, text) {
    const el = await this.findByText(tag, text)
    if (!el) throw new Error(`未找到包含文本 "${text}" 的 <${tag}> 元素`)
    await this.clickElement(el)
    this.log.debug(`点击文本元素: <${tag}>"${text}"`)
  }

  /**
   * 向 ElementHandle 输入文字（配合 findElement 使用）
   *
   * 策略：CDP Input.insertText，兼容普通 input 和 React/Vue 富文本编辑器。
   * 按段落拆分，段间模拟思考停顿，与 humanPaste 保持一致。
   *
   * @param {ElementHandle} element - 目标元素句柄
   * @param {string} text - 要输入的文字
   */
  async humanTypeInElement(element, text) {
    const preMin = cfg('keyboard.pre_type_delay_min', 300)
    const preMax = cfg('keyboard.pre_type_delay_max', 800)

    await this.clickElement(element)
    await randomDelay(preMin, preMax)

    const cdp = await this.page.target().createCDPSession()
    const paragraphs = text.split('\n')

    // 自适应输入策略（与 humanPaste 一致）
    const imeEnabled = cfg('keyboard.ime_enabled', true)
    const imeThresholdShort = cfg('keyboard.ime_threshold_short', 200)
    const imeThresholdLong = cfg('keyboard.ime_threshold_long', 800)
    const imeParagraphLimit = cfg('keyboard.ime_paragraph_limit', 3)
    const totalLen = text.length

    let mode = 'ime'
    if (totalLen > imeThresholdLong) {
      mode = 'fast'
      this.log.info(`长文模式（${totalLen}字），分段快速输入`)
    } else if (totalLen > imeThresholdShort) {
      mode = 'hybrid'
      this.log.info(`混合模式（${totalLen}字），前${imeParagraphLimit}段 IME`)
    }

    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i]
      if (para.length > 0) {
        let useIME = false
        if (mode === 'ime') {
          useIME = imeEnabled && containsChinese(para)
        } else if (mode === 'hybrid') {
          useIME = imeEnabled && containsChinese(para) && i < imeParagraphLimit
        }

        if (useIME) {
          try {
            await simulateIMEText(cdp, para)
          } catch (imeErr) {
            this.log.warn(`IME 输入第${i+1}段失败，降级为快速输入`)
            await cdp.send('Input.insertText', { text: para })
          }
        } else {
          const sentences = para.match(/[^。！？.!?\n]+[。！？.!?]?/g) || [para]
          for (let s = 0; s < sentences.length; s++) {
            await cdp.send('Input.insertText', { text: sentences[s] })
            if (s < sentences.length - 1) await randomDelay(150, 500)
          }
        }
      }
      if (i < paragraphs.length - 1) {
        await randomDelay(200, 500)
        await this.page.keyboard.press('Enter')
        const pauseMin = mode === 'fast' ? 300 : 800
        const pauseMax = mode === 'fast' ? 1000 : 2000
        await randomDelay(pauseMin, pauseMax)
      }
    }

    await cdp.detach()
    this.log.debug('humanTypeInElement 输入完成')
  }
}
