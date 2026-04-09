import { BasePlatformAdapter } from '../base.js'
import { randomDelay } from '../../core/human.js'
import { cfg } from '../../core/config.js'
import { PUBLISH_SELECTORS, INTERACT_SELECTORS } from './selectors.js'

/**
 * 微信公众号文章发布适配器
 *
 * 后台首页: https://mp.weixin.qq.com/
 * 编辑器: "新的创作"→"文章" 打开新标签页
 *
 * 微信公众号特点:
 *   - ProseMirror 富文本编辑器
 *   - 标题 textarea#title + 正文 .ProseMirror
 *   - 作者 input#author + 摘要 textarea#js_description
 *   - 原创声明 checkbox + 封面图 file input
 *   - 发表/保存草稿/预览 按钮
 */

const S = PUBLISH_SELECTORS

export class WechatAdapter extends BasePlatformAdapter {
  constructor(page) {
    super(page)
    this.platformName = 'wechat'
    this.homeUrl = 'https://mp.weixin.qq.com/'
    this.editorPage = null
  }

  getHomeUrl() { return this.homeUrl }
  getLoginUrl() { return 'https://mp.weixin.qq.com/' }
  getInteractSelectors() { return INTERACT_SELECTORS }

  async publish(post) {
    this.log.info('========== 微信公众号发布开始 ==========')
    this.log.info(`标题: ${post.title}`)
    this._dryRun = !!post.dryRun
    if (this._dryRun) this.log.info('[dryRun] 填写内容后不点击发表按钮')

    try {
      await this.step1_openEditor()
      await this.step2_inputTitle(post.title)
      await this.step3_inputContent(post.content)
      await this.step4_inputAuthor(post.author || '')
      await this.step5_inputDigest(post.summary || post.content.substring(0, 80))

      if (post.images && post.images.length > 0) {
        await this.step6_uploadCover(post.images[0])
      }

      await this.step7_publish()

      this.log.info('========== 微信公众号发布完成 ==========')
      return { success: true, message: '微信公众号发布成功' }
    } catch (err) {
      this.log.error(`微信公众号发布失败: ${err.message}`)
      return { success: false, message: err.message }
    }
  }

  async step1_openEditor() {
    this.log.info('[Step 1] 打开微信公众号编辑器')
    await this.navigateTo(this.homeUrl)
    await randomDelay(2000, 4000)

    // 点击"新的创作"
    const createBtn = await this.findByText('div', S.createEntryText)
      || await this.findByText('span', S.createEntryText)
      || await this.findByText('button', S.createEntryText)
    if (createBtn) {
      await this.clickElement(createBtn)
      await randomDelay(1000, 2000)
    }

    // 点击"文章"菜单项
    const articleItem = await this.findByText('div', S.articleMenuText)
    if (articleItem) {
      await this.clickElement(articleItem)
      await randomDelay(3000, 5000)
    }

    // 获取新打开的编辑器标签页
    const browser = this.page.browser()
    const pages = await browser.pages()
    const editorPage = pages[pages.length - 1]

    if (editorPage.url().includes('appmsg')) {
      this.editorPage = editorPage
      this.page = editorPage
      this.log.info(`编辑器已打开: ${editorPage.url().substring(0, 80)}`)
    } else {
      this.log.warn('编辑器标签页未检测到，使用当前页面')
    }
    await randomDelay(1000, 3000)
  }

  async step2_inputTitle(title) {
    this.log.info('[Step 2] 输入标题')
    const el = await this.findElement([S.titleInput, S.titleInputAlt])
    if (!el) throw new Error('未找到标题输入框')
    await this.humanTypeInElement(el, title)
    await randomDelay(500, 1500)
  }

  async step3_inputContent(content) {
    this.log.info('[Step 3] 输入正文（ProseMirror）')
    const el = await this.findElement([S.contentInput, S.contentInputAlt])
    if (!el) throw new Error('未找到正文编辑器')
    await this.humanTypeInElement(el, content)
    await randomDelay(500, 1500)
  }

  async step4_inputAuthor(author) {
    if (!author) return
    this.log.info('[Step 4] 输入作者')
    const el = await this.findElement([S.authorInput, S.authorInputAlt])
    if (!el) { this.log.warn('未找到作者输入框，跳过'); return }
    await this.humanTypeInElement(el, author)
    await randomDelay(300, 800)
  }

  async step5_inputDigest(digest) {
    this.log.info('[Step 5] 输入摘要')
    const el = await this.findElement([S.digestInput, S.digestInputAlt])
    if (!el) { this.log.warn('未找到摘要输入框，跳过'); return }
    await this.humanTypeInElement(el, digest)
    await randomDelay(500, 1000)
  }

  async step6_uploadCover(imagePath) {
    this.log.info('[Step 6] 上传封面图')
    const fileInput = await this.findElement([S.coverFileInput])
    if (!fileInput) { this.log.warn('未找到封面上传入口，跳过'); return }
    await this.uploadFile(fileInput, imagePath)
    await randomDelay(2000, 4000)
  }

  async step7_publish() {
    if (this._dryRun) {
      this.log.info('[Step 7] dryRun 模式，内容已填写，等待人工确认后手动发表')
      return
    }
    this.log.info('[Step 7] 点击发表')
    const btn = await this.page.$(S.publishButtonClass)
      || await this.findByText('button', S.publishButtonText)
    if (!btn) throw new Error('未找到发表按钮')
    await this.clickElement(btn)
    await randomDelay(2000, 5000)
  }
}
