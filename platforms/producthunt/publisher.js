import { BasePlatformAdapter } from '../base.js'
import { randomDelay, sleep } from '../../core/human.js'
import { cfg } from '../../core/config.js'
import { PUBLISH_SELECTORS, INTERACT_SELECTORS } from './selectors.js'
import path from 'path'

/**
 * Product Hunt 发布适配器
 *
 * 发布页面: https://www.producthunt.com/posts/new
 *
 * Product Hunt 特点:
 *   - 产品发布模式（标题 + 描述 + 图片）
 *   - 仅用于正式产品发布
 *   - 建议人工复核
 */

const SELECTORS = PUBLISH_SELECTORS

export class ProducthuntAdapter extends BasePlatformAdapter {
  constructor(page) {
    super(page)
    this.platformName = 'producthunt'
    this.publishUrl = 'https://www.producthunt.com/posts/new'
  }

  // 平台元数据
  getHomeUrl() { return 'https://www.producthunt.com/' }
  getLoginUrl() { return 'https://www.producthunt.com/login' }
  getInteractSelectors() { return INTERACT_SELECTORS }

  async publish(post) {
    this.log.info('========== Product Hunt 发布开始 ==========')
    this.log.info(`标题: ${post.title}`)
    this._dryRun = !!post.dryRun
    if (this._dryRun) this.log.info('[dryRun] 审核模式：填写内容后不点击提交按钮')

    try {
      await this.step1_openPage()
      await this.step2_inputTitle(post.title)
      await this.step3_inputContent(post.content)

      if (post.images && post.images.length > 0) {
        await this.step4_uploadImage(post.images[0])
      }

      await this.step5_submit()

      await this.fillRemainingTime()
      await this.postPublishBrowse()

      this.log.info('========== Product Hunt 发布成功 ==========')
      return { success: true, message: '发布成功' }

    } catch (err) {
      this.log.error(`Product Hunt 发布失败: ${err.message}`)
      await this.conditionalScreenshot('ph_error', 'error')
      return { success: false, message: err.message }
    }
  }

  async step1_openPage() {
    this.log.info('[步骤1] 打开 Product Hunt 发布页面')
    await this.navigateTo(this.publishUrl)

    const currentUrl = this.page.url()
    if (currentUrl.includes(SELECTORS.loginPageIndicator)) {
      throw new Error('未登录或登录已过期，请先在浏览器中登录 Product Hunt')
    }

    await this.conditionalScreenshot('ph_step1_open', 'step')
    await this.browseForStep('open_page')
  }

  async step2_inputTitle(title) {
    this.log.info('[步骤2] 输入标题')
    await this.type(SELECTORS.titleInput, title)
    await this.actionPause()
    await this.browseForStep('input_title')
  }

  async step3_inputContent(content) {
    this.log.info('[步骤3] 输入描述')
    const selector = await this.findSelector([
      SELECTORS.contentInput,
      SELECTORS.contentInputAlt,
    ])
    await this.click(selector)
    await randomDelay(500, 1000)
    await this.type(selector, content)
    await this.actionPause()
    await this.browseForStep('input_content')
  }

  async step4_uploadImage(imagePath) {
    this.log.info('[步骤4] 上传图片')
    const absolutePath = path.resolve(imagePath)
    await this.uploadFile(SELECTORS.imageInput, [absolutePath])

    const pollInterval = cfg('upload.processing_poll_interval', 5000)
    await sleep(pollInterval)
    this.log.info('图片上传完成')
    await this.browseForStep('upload_images')
  }

  async step5_submit() {
    if (this._dryRun) {
      this.log.info('[步骤5] dryRun 模式，内容已填写，等待人工确认后手动提交')
      return
    }
    this.log.info('[步骤5] 提交')

    const reviewDelayMin = cfg('steps.publish.review_delay_min', 3000)
    const reviewDelayMax = cfg('steps.publish.review_delay_max', 8000)
    const waitAfterMin = cfg('steps.publish.wait_after_min', 5000)
    const waitAfterMax = cfg('steps.publish.wait_after_max', 15000)

    await randomDelay(reviewDelayMin, reviewDelayMax)
    await this.conditionalScreenshot('ph_before_publish', 'before_publish')

    const el = await this.page.$(SELECTORS.submitButton)
    if (!el) {
      throw new Error('未找到提交按钮，页面结构可能已变更')
    }
    await el.click()

    this.log.info('已点击提交按钮')
    await randomDelay(waitAfterMin, waitAfterMax)
    await this.conditionalScreenshot('ph_after_publish', 'after_publish')
  }

}
