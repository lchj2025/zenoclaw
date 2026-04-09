import { BasePlatformAdapter } from '../base.js'
import { randomDelay, sleep } from '../../core/human.js'
import { cfg } from '../../core/config.js'
import { PUBLISH_SELECTORS, INTERACT_SELECTORS } from './selectors.js'
import path from 'path'

/**
 * X (Twitter) 发帖适配器
 *
 * 发布页面: https://x.com/compose/post
 *
 * X 特点:
 *   - 短文本（无标题字段，正文280字符限制）
 *   - 支持图片（最多4张）
 *   - data-testid 属性定位元素，较稳定
 */

const SELECTORS = PUBLISH_SELECTORS

export class XAdapter extends BasePlatformAdapter {
  constructor(page) {
    super(page)
    this.platformName = 'x'
    this.publishUrl = 'https://x.com/compose/post'
  }

  // 平台元数据
  getHomeUrl() { return 'https://x.com/home' }
  getLoginUrl() { return 'https://x.com/i/flow/login' }
  getInteractSelectors() { return INTERACT_SELECTORS }

  async publish(post) {
    this.log.info('========== X 发帖开始 ==========')
    this.log.info(`内容: ${(post.content || post.title || '').slice(0, 50)}...`)
    this._dryRun = !!post.dryRun
    if (this._dryRun) this.log.info('[dryRun] 审核模式：填写内容后不点击发推按钮')

    try {
      await this.step1_openPage()

      // X 无标题，用 content 或 fallback 到 title
      const text = post.content || post.title || ''
      await this.step2_inputContent(text)

      if (post.images && post.images.length > 0) {
        await this.step3_uploadImages(post.images)
      }

      await this.step4_submit()

      await this.fillRemainingTime()
      await this.postPublishBrowse()

      this.log.info('========== X 发帖成功 ==========')
      return { success: true, message: '发布成功' }

    } catch (err) {
      this.log.error(`X 发帖失败: ${err.message}`)
      await this.conditionalScreenshot('x_error', 'error')
      return { success: false, message: err.message }
    }
  }

  async step1_openPage() {
    this.log.info('[步骤1] 打开 X 发帖页面')
    await this.navigateTo(this.publishUrl)

    const currentUrl = this.page.url()
    if (currentUrl.includes(SELECTORS.loginPageIndicator)) {
      throw new Error('未登录或登录已过期，请先在浏览器中登录 X')
    }

    await this.conditionalScreenshot('x_step1_open', 'step')
    await this.browseForStep('open_page')
  }

  async step2_inputContent(content) {
    this.log.info('[步骤2] 输入推文内容')

    const selector = await this.findSelector([
      SELECTORS.contentInput,
      SELECTORS.contentInputAlt,
    ])

    await this.click(selector)
    await randomDelay(500, 1000)
    await this.type(selector, content)
    await this.actionPause()
    await this.conditionalScreenshot('x_step2_content', 'step')
    await this.browseForStep('input_content')
  }

  async step3_uploadImages(imagePaths) {
    this.log.info(`[步骤3] 上传 ${imagePaths.length} 张图片`)

    const absolutePaths = imagePaths.map(p => path.resolve(p))
    const selector = await this.findSelector([
      SELECTORS.imageInput,
      SELECTORS.imageInputAlt,
    ])

    await this.uploadFile(selector, absolutePaths)

    const pollInterval = cfg('upload.processing_poll_interval', 5000)
    this.log.info('等待图片处理...')
    await sleep(pollInterval)

    this.log.info('图片上传完成')
    await this.conditionalScreenshot('x_step3_upload', 'step')
    await this.browseForStep('upload_images')
  }

  async step4_submit() {
    if (this._dryRun) {
      this.log.info('[步骤4] dryRun 模式，内容已填写，等待人工确认后手动发推')
      return
    }
    this.log.info('[步骤4] 发送推文')

    const reviewDelayMin = cfg('steps.publish.review_delay_min', 3000)
    const reviewDelayMax = cfg('steps.publish.review_delay_max', 8000)
    const waitAfterMin = cfg('steps.publish.wait_after_min', 5000)
    const waitAfterMax = cfg('steps.publish.wait_after_max', 15000)

    await randomDelay(reviewDelayMin, reviewDelayMax)
    await this.conditionalScreenshot('x_before_publish', 'before_publish')

    const el = await this.page.$(SELECTORS.submitButton)
    if (!el) {
      throw new Error('未找到发推按钮，页面结构可能已变更')
    }
    await el.click()

    this.log.info('已点击发推按钮')
    await randomDelay(waitAfterMin, waitAfterMax)
    await this.conditionalScreenshot('x_after_publish', 'after_publish')
  }

}
