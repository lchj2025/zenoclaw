import { BasePlatformAdapter } from '../base.js'
import { randomDelay, sleep } from '../../core/human.js'
import { cfg } from '../../core/config.js'
import { PUBLISH_SELECTORS, INTERACT_SELECTORS } from './selectors.js'
import path from 'path'

/**
 * B站 (Bilibili) 专栏文章投稿适配器
 *
 * 投稿页: https://member.bilibili.com/platform/upload/text/new-edit
 *
 * ⚠️ 选择器基于 2026 年页面结构，改版后需更新 selectors.js
 *
 * B站特点:
 *   - 专栏文章模式（标题 + 富文本正文）
 *   - 正文编辑器在 iframe(york/read-editor) 内，需切换 frame 操作
 *   - 标题 textarea 在主页面
 *   - 封面图上传在主页面
 */

const SELECTORS = PUBLISH_SELECTORS

export class BilibiliAdapter extends BasePlatformAdapter {
  constructor(page) {
    super(page)
    this.platformName = 'bilibili'
    this.publishUrl = SELECTORS.publishUrl || 'https://member.bilibili.com/platform/upload/text/new-edit'
  }

  // 平台元数据
  getHomeUrl() { return 'https://www.bilibili.com/' }
  getLoginUrl() { return 'https://passport.bilibili.com/login' }
  getInteractSelectors() { return INTERACT_SELECTORS }

  /**
   * 执行完整的专栏投稿流程
   */
  async publish(post) {
    this.log.info('========== B站投稿开始 ==========')
    this.log.info(`标题: ${post.title}`)
    this._dryRun = !!post.dryRun
    if (this._dryRun) this.log.info('[dryRun] 审核模式：填写内容后不点击发布按钮')

    try {
      await this.step1_openPublishPage()
      await this.step2_inputTitle(post.title)
      await this.step3_inputContent(post.content)

      if (post.images && post.images.length > 0) {
        await this.step4_uploadCover(post.images[0])
      }

      await this.step5_publish()

      await this.fillRemainingTime()
      await this.postPublishBrowse()

      this.log.info('========== B站投稿成功 ==========')
      return { success: true, message: '发布成功' }

    } catch (err) {
      this.log.error(`B站投稿失败: ${err.message}`)
      await this.conditionalScreenshot('bilibili_error', 'error')
      return { success: false, message: err.message }
    }
  }

  // ============================================================
  // 各步骤实现
  // ============================================================

  async step1_openPublishPage() {
    this.log.info('[步骤1] 打开B站专栏投稿页')
    await this.navigateTo(this.publishUrl)

    // 登录检测
    const currentUrl = this.page.url()
    if (currentUrl.includes(SELECTORS.loginPageIndicator)) {
      throw new Error('未登录或登录已过期，请先在浏览器中登录B站')
    }

    await this.conditionalScreenshot('bilibili_step1_open', 'step')
    await this.browseForStep('open_page')
  }

  /**
   * 获取并缓存编辑器 iframe frame 对象
   * B站所有表单元素（标题/正文/发布按钮）均在 york/read-editor iframe 内
   */
  async _getEditorFrame() {
    if (this._editorFrame) return this._editorFrame

    const elementTimeout = cfg('browser.element_timeout', 30000)
    await this.page.waitForSelector(SELECTORS.editorFrame, { timeout: elementTimeout })

    const frameEl = await this.page.$(SELECTORS.editorFrame)
    const frame = await frameEl.contentFrame()
    if (!frame) throw new Error('无法切换到B站编辑器 iframe')

    await randomDelay(1000, 2000)
    this._editorFrame = frame
    return frame
  }

  async step2_inputTitle(title) {
    this.log.info('[步骤2] 输入标题（iframe 内）')

    const frame = await this._getEditorFrame()

    // 标题 textarea 在 iframe 内：class="title-input__inner"
    const titleSel = SELECTORS.titleInputAlt  // '.title-input__inner'
    await frame.waitForSelector(titleSel, { visible: true, timeout: cfg('browser.element_timeout', 30000) })

    await frame.click(titleSel)
    await randomDelay(300, 800)

    // CDP 输入标题（防止中文乱码）
    const cdp = await frame.target().createCDPSession()
    await cdp.send('Input.insertText', { text: title })
    await cdp.detach()

    await this.actionPause()
    await this.conditionalScreenshot('bilibili_step2_title', 'step')
    await this.browseForStep('input_title')
  }

  async step3_inputContent(content) {
    this.log.info('[步骤3] 输入正文（iframe 内 TipTap 编辑器）')

    const frame = await this._getEditorFrame()
    const elementTimeout = cfg('browser.element_timeout', 30000)

    // 等待正文编辑器出现
    await frame.waitForSelector(SELECTORS.contentInput, { visible: true, timeout: elementTimeout })

    // 点击激活编辑器（初始 contenteditable="false"，点击后 TipTap 切换为可编辑）
    await frame.click(SELECTORS.contentInput)
    await randomDelay(800, 1500)

    // 检查 contenteditable 是否已变为 true
    const ceEnabled = await frame.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return false
      return el.getAttribute('contenteditable') === 'true'
    }, SELECTORS.contentInput)

    const cdp = await frame.target().createCDPSession()
    const paragraphs = content.split('\n')

    if (ceEnabled) {
      // contenteditable="true"：使用 CDP insertText（中文友好）
      this.log.info('[步骤3] 编辑器已激活，使用 CDP insertText')
      for (let i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].length > 0) {
          await cdp.send('Input.insertText', { text: paragraphs[i] })
        }
        if (i < paragraphs.length - 1) {
          await randomDelay(200, 500)
          await frame.keyboard.press('Enter')
          await randomDelay(800, 2000)
        }
      }
    } else {
      // contenteditable="false"：降级通过 CDP 模拟按键事件（TipTap 监听 keydown）
      this.log.warn('[步骤3] 编辑器未标记为 contenteditable="true"，使用 insertText 降级输入')
      for (let i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].length > 0) {
          // CDP dispatchKeyEvent 可以触发 TipTap 内部的 keydown 监听
          await cdp.send('Input.insertText', { text: paragraphs[i] })
        }
        if (i < paragraphs.length - 1) {
          await randomDelay(200, 500)
          await frame.keyboard.press('Enter')
          await randomDelay(800, 2000)
        }
      }
    }
    await cdp.detach()

    await this.actionPause()
    await this.conditionalScreenshot('bilibili_step3_content', 'step')
    await this.browseForStep('input_content')
  }

  async step4_uploadCover(imagePath) {
    this.log.info('[步骤4] 上传封面图')

    const absolutePath = path.resolve(imagePath)

    try {
      // 封面图上传 input 在主页面
      const fileInputSelector = 'input[type="file"]'
      await this.uploadFile(fileInputSelector, [absolutePath])

      const pollInterval = cfg('upload.processing_poll_interval', 5000)
      this.log.info('等待封面图处理...')
      await sleep(pollInterval)
      this.log.info('封面图上传完成')
    } catch (err) {
      this.log.warn(`封面图上传失败，跳过: ${err.message}`)
    }

    await this.conditionalScreenshot('bilibili_step4_cover', 'step')
    await this.browseForStep('upload_images')
  }

  async step5_publish() {
    if (this._dryRun) {
      this.log.info('[步骤5] dryRun 模式，内容已填写，等待人工确认后手动发布')
      return
    }
    this.log.info('[步骤5] 发布专栏文章')

    const reviewDelayMin = cfg('steps.publish.review_delay_min', 3000)
    const reviewDelayMax = cfg('steps.publish.review_delay_max', 8000)
    const waitAfterMin   = cfg('steps.publish.wait_after_min', 5000)
    const waitAfterMax   = cfg('steps.publish.wait_after_max', 15000)

    await randomDelay(reviewDelayMin, reviewDelayMax)
    await this.conditionalScreenshot('bilibili_before_publish', 'before_publish')

    // 发布按钮在 york/read-editor iframe 内
    const frame = await this._getEditorFrame()

    let clicked = false

    // 优先用 CSS class 匹配（button.vui_button--blue）
    try {
      const el = await frame.$(SELECTORS.publishButton)
      if (el) {
        await el.click()
        clicked = true
        this.log.info('在 iframe 内点击发布按钮（class）')
      }
    } catch { /* continue */ }

    // fallback：在 iframe 内文本匹配"发布"按钮
    if (!clicked) {
      try {
        const buttons = await frame.$$('button')
        for (const btn of buttons) {
          const text = await btn.evaluate(el => el.textContent.trim())
          if (text === SELECTORS.publishButtonText || text.includes(SELECTORS.publishButtonText)) {
            await btn.click()
            clicked = true
            this.log.info('在 iframe 内点击发布按钮（文本匹配）')
            break
          }
        }
      } catch { /* continue */ }
    }

    // 最终 fallback：在主页面找（兼容未来改版）
    if (!clicked) {
      const btn = await this.findByText('button', SELECTORS.publishButtonText)
      if (btn) {
        await btn.click()
        clicked = true
        this.log.info('在主页面点击发布按钮')
      }
    }

    if (!clicked) {
      throw new Error('未找到发布按钮（已搜索 iframe 内和主页面），页面结构可能已变更')
    }

    await randomDelay(waitAfterMin, waitAfterMax)
    await this.conditionalScreenshot('bilibili_after_publish', 'after_publish')
  }
}
