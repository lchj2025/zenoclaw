import { BasePlatformAdapter } from '../base.js'
import { randomDelay } from '../../core/human.js'
import { cfg } from '../../core/config.js'
import { PUBLISH_SELECTORS, INTERACT_SELECTORS } from './selectors.js'

/**
 * 搜狐号文章发布适配器
 *
 * 内容管理页: https://mp.sohu.com/mpfe/v4/contentManagement/first/page
 * 文章编辑页: 通过"发布内容"→"文章"导航到达
 *
 * 搜狐号特点:
 *   - Quill 富文本编辑器（.ql-editor contenteditable）
 *   - 标题 input + 正文 Quill + 摘要 textarea
 *   - 原创声明 toggle + 封面自动/手动
 */

const S = PUBLISH_SELECTORS

export class SohuAdapter extends BasePlatformAdapter {
  constructor(page) {
    super(page)
    this.platformName = 'sohu'
    this.contentManagementUrl = 'https://mp.sohu.com/mpfe/v4/contentManagement/first/page'
  }

  getHomeUrl() { return this.contentManagementUrl }
  getLoginUrl() { return 'https://mp.sohu.com/' }
  getInteractSelectors() { return INTERACT_SELECTORS }

  async publish(post) {
    this.log.info('========== 搜狐号发布开始 ==========')
    this.log.info(`标题: ${post.title}`)
    this._dryRun = !!post.dryRun
    if (this._dryRun) this.log.info('[dryRun] 填写内容后不点击发布按钮')

    try {
      await this.step1_navigateToEditor()
      await this.step2_inputTitle(post.title)
      await this.step3_inputContent(post.content)
      await this.step4_inputSummary(post.summary || post.content.substring(0, 60))
      await this.step5_setOriginal()

      if (post.images && post.images.length > 0) {
        await this.step6_uploadCover(post.images[0])
      }

      await this.step7_publish()

      this.log.info('========== 搜狐号发布完成 ==========')
      return { success: true, message: '搜狐号发布成功' }
    } catch (err) {
      this.log.error(`搜狐号发布失败: ${err.message}`)
      return { success: false, message: err.message }
    }
  }

  async step1_navigateToEditor() {
    this.log.info('[Step 1] 导航到搜狐号编辑器')
    await this.navigateTo(this.contentManagementUrl)
    await randomDelay(2000, 4000)

    // 点击"发布内容"
    const pubEntry = await this.findByText('button', S.publishEntryText)
    if (pubEntry) {
      await this.clickElement(pubEntry)
      await randomDelay(2000, 4000)
    }

    // 点击"文章"
    const articleTab = await this.findByText('a', S.articleTabText)
    if (articleTab) {
      await this.clickElement(articleTab)
      await randomDelay(3000, 5000)
    }

    this.log.info(`编辑器URL: ${this.page.url()}`)
  }

  async step2_inputTitle(title) {
    this.log.info('[Step 2] 输入标题')
    const el = await this.findElement([S.titleInput, S.titleInputAlt])
    if (!el) throw new Error('未找到标题输入框')
    await this.humanTypeInElement(el, title)
    await randomDelay(500, 1500)
  }

  async step3_inputContent(content) {
    this.log.info('[Step 3] 输入正文（Quill 编辑器）')
    const el = await this.findElement([S.contentInput, S.contentInputAlt])
    if (!el) throw new Error('未找到正文编辑器')
    await this.humanTypeInElement(el, content)
    await randomDelay(500, 1500)
  }

  async step4_inputSummary(summary) {
    this.log.info('[Step 4] 输入摘要')
    const el = await this.findElement([S.summaryInput, S.summaryInputAlt])
    if (!el) { this.log.warn('未找到摘要输入框，跳过'); return }
    await this.humanTypeInElement(el, summary)
    await randomDelay(500, 1000)
  }

  async step5_setOriginal() {
    this.log.info('[Step 5] 设置原创声明')
    try {
      const origLabel = await this.findByText('p', S.originalText)
        || await this.findByText('span', S.originalText)
        || await this.findByText('label', S.originalText)
      if (origLabel) {
        await this.clickElement(origLabel)
        await randomDelay(500, 1000)
        this.log.info('原创声明已勾选')
      } else {
        this.log.warn('未找到原创声明选项，跳过')
      }
    } catch (e) {
      this.log.warn(`原创声明设置失败: ${e.message}`)
    }
  }

  async step6_uploadCover(imagePath) {
    this.log.info('[Step 6] 上传封面图')
    try {
      const coverBtn = await this.findByText('div', S.coverUploadText)
      if (coverBtn) {
        await this.clickElement(coverBtn)
        await randomDelay(1000, 2000)
      }
      const fileInput = await this.findElement([S.coverFileInput, 'input[type="file"]'])
      if (fileInput) {
        await this.uploadFile(fileInput, imagePath)
        await randomDelay(2000, 4000)
      } else {
        this.log.warn('未找到封面文件上传入口，跳过')
      }
    } catch (e) {
      this.log.warn(`封面上传失败: ${e.message}`)
    }
  }

  async step7_publish() {
    if (this._dryRun) {
      this.log.info('[Step 7] dryRun 模式，内容已填写，等待人工确认后手动发布')
      return
    }
    this.log.info('[Step 7] 点击发布')
    await this.clickByText('button', S.publishButtonText)
    await randomDelay(2000, 5000)
  }
}
