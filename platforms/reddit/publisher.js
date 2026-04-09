import { BasePlatformAdapter } from '../base.js'
import { randomDelay, sleep } from '../../core/human.js'
import { cfg } from '../../core/config.js'
import { PUBLISH_SELECTORS, INTERACT_SELECTORS } from './selectors.js'
import path from 'path'

/**
 * Reddit 帖子发布适配器
 *
 * 发布页面: https://www.reddit.com/submit
 *
 * Reddit 特点:
 *   - 标题 + 正文（富文本或 Markdown）
 *   - 需要选择 subreddit
 *   - 支持图片/链接/投票等多种帖子类型
 *   - 建议人工复核
 */

const SELECTORS = PUBLISH_SELECTORS

export class RedditAdapter extends BasePlatformAdapter {
  constructor(page) {
    super(page)
    this.platformName = 'reddit'
    this.publishUrl = 'https://www.reddit.com/submit'
  }

  // 平台元数据
  getHomeUrl() { return 'https://www.reddit.com/' }
  getLoginUrl() { return 'https://www.reddit.com/login' }
  getInteractSelectors() { return INTERACT_SELECTORS }

  async publish(post) {
    this.log.info('========== Reddit 发帖开始 ==========')
    this.log.info(`标题: ${post.title}`)
    this._dryRun = !!post.dryRun
    if (this._dryRun) this.log.info('[dryRun] 审核模式：填写内容后不点击发布按钮')

    try {
      await this.step1_openPage()

      if (post.subreddit) {
        await this.step2_selectSubreddit(post.subreddit)
      }

      await this.step3_inputTitle(post.title)
      await this.step4_inputContent(post.content)

      if (post.images && post.images.length > 0) {
        await this.step5_uploadImage(post.images[0])
      }

      await this.step6_submit()

      await this.fillRemainingTime()
      await this.postPublishBrowse()

      this.log.info('========== Reddit 发帖成功 ==========')
      return { success: true, message: '发布成功' }

    } catch (err) {
      this.log.error(`Reddit 发帖失败: ${err.message}`)
      await this.conditionalScreenshot('reddit_error', 'error')
      return { success: false, message: err.message }
    }
  }

  async step1_openPage() {
    this.log.info('[步骤1] 打开 Reddit 发帖页面')
    await this.navigateTo(this.publishUrl)

    const currentUrl = this.page.url()
    if (currentUrl.includes(SELECTORS.loginPageIndicator) || currentUrl.includes(SELECTORS.ageVerifyIndicator)) {
      throw new Error('未登录或需要年龄验证，请先在浏览器中登录 Reddit 并完成年龄确认')
    }

    await this.conditionalScreenshot('reddit_step1_open', 'step')
    await this.browseForStep('open_page')
  }

  async step2_selectSubreddit(subreddit) {
    this.log.info(`[步骤2] 选择 subreddit: ${subreddit}`)
    try {
      const input = await this.page.$(SELECTORS.subredditInput)
      if (input) {
        await this.click(SELECTORS.subredditInput)
        await randomDelay(500, 1000)
        await this.type(SELECTORS.subredditInput, subreddit)
        await randomDelay(2000, 3000)
        // 选择第一个建议
        await this.page.keyboard.press('ArrowDown')
        await this.page.keyboard.press('Enter')
        await randomDelay(1000, 2000)
      }
    } catch (err) {
      this.log.warn(`选择 subreddit 失败: ${err.message}`)
    }
  }

  async step3_inputTitle(title) {
    this.log.info('[步骤3] 输入标题（shadow DOM textarea）')

    const elementTimeout = cfg('browser.element_timeout', 30000)

    // 等待外层 web component 出现
    await this.page.waitForSelector(SELECTORS.titleComponent, { visible: true, timeout: elementTimeout })

    // 通过 shadow DOM 找内部 textarea 并点击
    const focused = await this.page.evaluate((compSel, inputSel) => {
      const comp = document.querySelector(compSel)
      if (!comp || !comp.shadowRoot) return false
      const textarea = comp.shadowRoot.querySelector(inputSel)
      if (!textarea) return false
      textarea.focus()
      textarea.click()
      return true
    }, SELECTORS.titleComponent, SELECTORS.titleInputInShadow)

    if (!focused) {
      // fallback：直接点击外层 component
      await this.page.click(SELECTORS.titleComponent)
    }

    await randomDelay(300, 800)

    // CDP insertText 输入标题
    const cdp = await this.page.target().createCDPSession()
    await cdp.send('Input.insertText', { text: title })
    await cdp.detach()

    await this.actionPause()
    await this.conditionalScreenshot('reddit_step3_title', 'step')
    await this.browseForStep('input_title')
  }

  async step4_inputContent(content) {
    this.log.info('[步骤4] 输入正文（contenteditable rte 区域）')

    const elementTimeout = cfg('browser.element_timeout', 30000)

    // slot="rte" contenteditable div（正文编辑区，实测 visible=true）
    const bodySel = await this.findSelector([
      SELECTORS.contentInput,
      SELECTORS.contentInputAlt,
      SELECTORS.contentInputFallback,
    ])

    await this.page.waitForSelector(bodySel, { visible: true, timeout: elementTimeout })
    await this.page.click(bodySel)
    await randomDelay(500, 1000)

    // CDP insertText 输入正文
    const cdp = await this.page.target().createCDPSession()
    const paragraphs = content.split('\n')
    for (let i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].length > 0) {
        await cdp.send('Input.insertText', { text: paragraphs[i] })
      }
      if (i < paragraphs.length - 1) {
        await randomDelay(200, 500)
        await this.page.keyboard.press('Enter')
        await randomDelay(500, 1500)
      }
    }
    await cdp.detach()

    await this.actionPause()
    await this.conditionalScreenshot('reddit_step4_content', 'step')
    await this.browseForStep('input_content')
  }

  async step5_uploadImage(imagePath) {
    this.log.info('[步骤5] 上传图片')
    const absolutePath = path.resolve(imagePath)
    await this.uploadFile(SELECTORS.imageInput, [absolutePath])

    const pollInterval = cfg('upload.processing_poll_interval', 5000)
    await sleep(pollInterval)
    this.log.info('图片上传完成')
    await this.browseForStep('upload_images')
  }

  async step6_submit() {
    if (this._dryRun) {
      this.log.info('[步骤6] dryRun 模式，内容已填写，等待人工确认后手动发布')
      return
    }
    this.log.info('[步骤6] 提交帖子')

    const reviewDelayMin = cfg('steps.publish.review_delay_min', 3000)
    const reviewDelayMax = cfg('steps.publish.review_delay_max', 8000)
    const waitAfterMin = cfg('steps.publish.wait_after_min', 5000)
    const waitAfterMax = cfg('steps.publish.wait_after_max', 15000)

    await randomDelay(reviewDelayMin, reviewDelayMax)
    await this.conditionalScreenshot('reddit_before_publish', 'before_publish')

    // 发布按钮在填写内容后才出现（懒加载），最多等 15s
    let clicked = false
    const deadline = Date.now() + 15000
    while (!clicked && Date.now() < deadline) {
      // 尝试文本匹配（中文界面=发布，英文=Post）
      const btn = await this.findByText('button', SELECTORS.publishButtonText)
        || await this.findByText('button', SELECTORS.publishButtonTextAlt)
      if (btn) {
        await btn.click()
        clicked = true
        this.log.info('已点击发布按钮（文本匹配）')
        break
      }
      // type=submit 降级
      const submitBtn = await this.page.$(SELECTORS.publishButtonType)
      if (submitBtn) {
        const text = await submitBtn.evaluate(el => el.textContent.trim())
        // 排除非发布的 submit 按钮（如筛选）
        if (!text.includes('筛选') && !text.includes('filter') && !text.includes('应用')) {
          await submitBtn.click()
          clicked = true
          this.log.info(`已点击发布按钮（type=submit, text="${text}"）`)
          break
        }
      }
      await sleep(1000)
    }

    if (!clicked) {
      throw new Error('15s 内未找到发布按钮，可能需要先选择 subreddit 或页面结构已变更')
    }

    await randomDelay(waitAfterMin, waitAfterMax)
    await this.conditionalScreenshot('reddit_after_publish', 'after_publish')
  }

}
