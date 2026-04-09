import { BasePlatformAdapter } from '../base.js'
import { randomDelay, sleep } from '../../core/human.js'
import { cfg } from '../../core/config.js'
import { PUBLISH_SELECTORS, INTERACT_SELECTORS } from './selectors.js'
import path from 'path'

/**
 * 即刻动态发帖适配器
 *
 * 发布页面: https://web.okjike.com/following
 *
 * ⚠️ 选择器基于 2026 年页面结构，改版后需更新 selectors.js
 *
 * 即刻特点:
 *   - 短动态模式（无标题字段）
 *   - 正文 + 图片（最多 9 张）
 *   - 圈子标签自动识别
 *   - 通过首页顶部编辑框发布
 */

const SELECTORS = PUBLISH_SELECTORS

export class JikeAdapter extends BasePlatformAdapter {
  constructor(page) {
    super(page)
    this.platformName = 'jike'
    this.publishUrl = 'https://web.okjike.com/following'
  }

  // 平台元数据
  getHomeUrl() { return 'https://web.okjike.com/' }
  getLoginUrl() { return 'https://web.okjike.com/login' }
  getInteractSelectors() { return INTERACT_SELECTORS }

  /**
   * 执行完整的发帖流程
   * 即刻无标题字段，只有正文 + 图片
   */
  async publish(post) {
    this.log.info('========== 即刻发帖开始 ==========')
    this.log.info(`内容: ${(post.content || '').slice(0, 50)}...`)
    this._dryRun = !!post.dryRun
    if (this._dryRun) this.log.info('[dryRun] 审核模式：填写内容后不点击发送按钮')

    try {
      await this.step1_openPage()
      await this.step2_inputContent(post.content || post.title)

      if (post.images && post.images.length > 0) {
        await this.step3_uploadImages(post.images)
      }

      await this.step4_submit()

      await this.fillRemainingTime()
      await this.postPublishBrowse()

      this.log.info('========== 即刻发帖成功 ==========')
      return { success: true, message: '发布成功' }

    } catch (err) {
      this.log.error(`即刻发帖失败: ${err.message}`)
      await this.conditionalScreenshot('jike_error', 'error')
      return { success: false, message: err.message }
    }
  }

  // ============================================================
  // 各步骤实现
  // ============================================================

  async step1_openPage() {
    this.log.info('[步骤1] 打开即刻首页')
    await this.navigateTo(this.publishUrl)

    // 登录检测
    const currentUrl = this.page.url()
    if (currentUrl.includes(SELECTORS.loginPageIndicator)) {
      throw new Error('未登录或登录已过期，请先在浏览器中登录即刻')
    }

    await this.conditionalScreenshot('jike_step1_open', 'step')
    await this.browseForStep('open_page')
  }

  async step2_inputContent(content) {
    this.log.info('[步骤2] 输入动态内容')

    const selector = await this.findSelector([
      SELECTORS.contentInput,
      SELECTORS.contentInputAlt,
    ])

    // 即刻编辑器需要先点击激活
    await this.click(selector)
    await randomDelay(500, 1000)
    await this.type(selector, content)
    await this.actionPause()
    await this.conditionalScreenshot('jike_step2_content', 'step')
    await this.browseForStep('input_content')
  }

  async step3_uploadImages(imagePaths) {
    this.log.info(`[步骤3] 上传 ${imagePaths.length} 张图片`)

    const absolutePaths = imagePaths.map(p => path.resolve(p))
    await this.uploadFile(SELECTORS.imageInput, absolutePaths)

    // 等待图片处理
    const pollInterval = cfg('upload.processing_poll_interval', 5000)
    this.log.info('等待图片处理...')
    await sleep(pollInterval)

    this.log.info('图片上传完成')
    await this.conditionalScreenshot('jike_step3_upload', 'step')
    await this.browseForStep('upload_images')
  }

  async step4_submit() {
    if (this._dryRun) {
      this.log.info('[步骤4] dryRun 模式，内容已填写，等待人工确认后手动点击发送')
      return
    }
    this.log.info('[步骤4] 发送动态')

    const reviewDelayMin = cfg('steps.publish.review_delay_min', 3000)
    const reviewDelayMax = cfg('steps.publish.review_delay_max', 8000)
    const waitAfterMin = cfg('steps.publish.wait_after_min', 5000)
    const waitAfterMax = cfg('steps.publish.wait_after_max', 15000)

    await randomDelay(reviewDelayMin, reviewDelayMax)
    await this.conditionalScreenshot('jike_before_publish', 'before_publish')

    // CSS 选择器 + 文本匹配 fallback
    let clicked = false
    try {
      const el = await this.page.$(SELECTORS.submitButton)
      if (el) {
        await el.click()
        clicked = true
      }
    } catch { /* continue */ }

    if (!clicked) {
      const btn = await this.findByText('button', '发送')
      if (btn) {
        await btn.click()
        clicked = true
      }
    }

    if (!clicked) {
      throw new Error('未找到发送按钮，页面结构可能已变更')
    }

    this.log.info('已点击发送按钮')
    await randomDelay(waitAfterMin, waitAfterMax)
    await this.conditionalScreenshot('jike_after_publish', 'after_publish')
  }

}
