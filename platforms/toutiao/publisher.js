import { BasePlatformAdapter } from '../base.js'
import { randomDelay } from '../../core/human.js'
import { cfg } from '../../core/config.js'
import { PUBLISH_SELECTORS, INTERACT_SELECTORS } from './selectors.js'

/**
 * 今日头条文章发布适配器
 *
 * 文章发布页: https://mp.toutiao.com/profile_v4/graphic/publish
 *
 * ⚠️ 选择器基于 2026 年页面结构，改版后需更新 selectors.js
 *
 * 头条特点:
 *   - byte-* 组件库 + syl-* 富文本编辑器
 *   - 标题 textarea + 正文 ProseMirror
 *   - 封面图上传
 */

const SELECTORS = PUBLISH_SELECTORS

export class ToutiaoAdapter extends BasePlatformAdapter {
  constructor(page) {
    super(page)
    this.platformName = 'toutiao'
    this.publishUrl = 'https://mp.toutiao.com/profile_v4/graphic/publish'
  }

  getHomeUrl() { return 'https://www.toutiao.com/' }
  getLoginUrl() { return 'https://www.toutiao.com/auth/login/' }
  getInteractSelectors() { return INTERACT_SELECTORS }

  async publish(post) {
    this.log.info('========== 头条发布开始 ==========')
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

      this.log.info('========== 头条发布完成 ==========')
      return { success: true, message: '头条发布成功' }
    } catch (err) {
      this.log.error(`头条发布失败: ${err.message}`)
      return { success: false, message: err.message }
    }
  }

  async step1_openPublishPage() {
    this.log.info('[Step 1] 打开头条文章发布页')
    await this.navigateTo(this.publishUrl)
    await randomDelay(cfg('timing.action_delay_min', 1000), cfg('timing.action_delay_max', 3000))
  }

  async step2_inputTitle(title) {
    this.log.info('[Step 2] 输入标题')
    const el = await this.findElement([SELECTORS.titleInput])
    if (!el) throw new Error('未找到标题输入框')
    await this.humanTypeInElement(el, title)
    await randomDelay(500, 1500)
  }

  async step3_inputContent(content) {
    this.log.info('[Step 3] 输入正文')
    const el = await this.findElement([SELECTORS.contentInput, SELECTORS.contentInputAlt])
    if (!el) throw new Error('未找到正文编辑器')
    await this.humanTypeInElement(el, content)
    await randomDelay(500, 1500)
  }

  async step4_uploadCover(imagePath) {
    this.log.info('[Step 4] 上传封面图')
    const fileInput = await this.findElement([SELECTORS.imageInput])
    if (!fileInput) { this.log.warn('未找到图片上传入口，跳过'); return }
    await this.uploadFile(fileInput, imagePath)
    await randomDelay(2000, 4000)
  }

  async step5_publish() {
    if (this._dryRun) {
      this.log.info('[Step 5] dryRun 模式，内容已填写，等待人工确认后手动发布')
      return
    }
    this.log.info('[Step 5] 点击发布')
    await this.clickByText('button', SELECTORS.publishButtonText)
    await randomDelay(2000, 5000)
  }
}
