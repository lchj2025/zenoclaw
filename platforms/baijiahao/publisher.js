import { BasePlatformAdapter } from '../base.js'
import { randomDelay } from '../../core/human.js'
import { cfg } from '../../core/config.js'
import { PUBLISH_SELECTORS, INTERACT_SELECTORS } from './selectors.js'

/**
 * 百家号文章发布适配器
 *
 * 文章发布页: https://baijiahao.baidu.com/builder/rc/edit?type=news
 *
 * 百家号特点:
 *   - UEditor iframe 富文本编辑器
 *   - 标题 textarea + 正文 iframe body contenteditable
 *   - 封面图 file input 上传
 */

const S = PUBLISH_SELECTORS

export class BaijiahaoAdapter extends BasePlatformAdapter {
  constructor(page) {
    super(page)
    this.platformName = 'baijiahao'
    this.publishUrl = 'https://baijiahao.baidu.com/builder/rc/edit?type=news'
  }

  getHomeUrl() { return 'https://baijiahao.baidu.com/builder/rc/home' }
  getLoginUrl() { return 'https://baijiahao.baidu.com/' }
  getInteractSelectors() { return INTERACT_SELECTORS }

  async publish(post) {
    this.log.info('========== 百家号发布开始 ==========')
    this.log.info(`标题: ${post.title}`)
    this._dryRun = !!post.dryRun
    if (this._dryRun) this.log.info('[dryRun] 填写内容后不点击发布按钮')

    try {
      await this.step1_openPublishPage()
      await this.step2_inputTitle(post.title)
      await this.step3_inputContent(post.content)

      if (post.images && post.images.length > 0) {
        await this.step4_uploadCover(post.images[0])
      }

      await this.step5_publish()

      this.log.info('========== 百家号发布完成 ==========')
      return { success: true, message: '百家号发布成功' }
    } catch (err) {
      this.log.error(`百家号发布失败: ${err.message}`)
      return { success: false, message: err.message }
    }
  }

  async step1_openPublishPage() {
    this.log.info('[Step 1] 打开百家号文章发布页')
    await this.navigateTo(this.publishUrl)
    await randomDelay(cfg('timing.action_delay_min', 1000), cfg('timing.action_delay_max', 3000))
  }

  async step2_inputTitle(title) {
    this.log.info('[Step 2] 输入标题')
    const el = await this.findElement([S.titleInput, S.titleInputAlt])
    if (!el) throw new Error('未找到标题输入框')
    await this.humanTypeInElement(el, title)
    await randomDelay(500, 1500)
  }

  async step3_inputContent(content) {
    this.log.info('[Step 3] 输入正文（iframe UEditor）')
    // 百家号正文在 iframe 内的 body contenteditable
    const frames = this.page.frames()
    for (const frame of frames) {
      if (frame === this.page.mainFrame()) continue
      try {
        const body = await frame.$(S.contentIframeBody) || await frame.$(S.contentIframeBodyAlt)
        if (body) {
          await body.click()
          await randomDelay(300, 600)
          const cdp = await this.page.target().createCDPSession()
          await cdp.send('Input.insertText', { text: content })
          await cdp.detach()
          this.log.info('正文输入完成（iframe body CDP）')
          await randomDelay(500, 1500)
          return
        }
      } catch { /* skip frame */ }
    }
    throw new Error('未找到百家号正文 iframe 编辑器')
  }

  async step4_uploadCover(imagePath) {
    this.log.info('[Step 4] 上传封面图')
    const fileInput = await this.findElement([S.coverFileInput])
    if (!fileInput) { this.log.warn('未找到封面上传入口，跳过'); return }
    await this.uploadFile(fileInput, imagePath)
    await randomDelay(2000, 4000)
  }

  async step5_publish() {
    if (this._dryRun) {
      this.log.info('[Step 5] dryRun 模式，内容已填写，等待人工确认后手动发布')
      return
    }
    this.log.info('[Step 5] 点击发布')
    await this.clickByText('button', S.publishButtonText)
    await randomDelay(2000, 5000)
  }
}
