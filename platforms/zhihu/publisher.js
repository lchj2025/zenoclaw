import { BasePlatformAdapter } from '../base.js'
import { randomDelay, sleep } from '../../core/human.js'
import { cfg } from '../../core/config.js'
import { PUBLISH_SELECTORS, INTERACT_SELECTORS } from './selectors.js'
import path from 'path'

/**
 * 知乎专栏文章发帖适配器
 *
 * 发帖页面: https://zhuanlan.zhihu.com/write
 *
 * ⚠️ 选择器基于 2026 年页面结构，改版后需更新 selectors.js
 *
 * 知乎特点:
 *   - 专栏文章模式（长文），非动态/想法
 *   - 标题 + 正文（富文本编辑器）
 *   - 封面图单张
 *   - 话题标签（搜索选择）
 *   - 投稿到专栏（可选）
 */

const SELECTORS = PUBLISH_SELECTORS

export class ZhihuAdapter extends BasePlatformAdapter {
  constructor(page) {
    super(page)
    this.platformName = 'zhihu'
    this.publishUrl = 'https://zhuanlan.zhihu.com/write'
  }

  // 平台元数据
  getHomeUrl() { return 'https://www.zhihu.com/' }
  getLoginUrl() { return 'https://www.zhihu.com/signin' }
  getInteractSelectors() { return INTERACT_SELECTORS }

  /**
   * 执行完整的发帖流程
   */
  async publish(post) {
    this.log.info('========== 知乎发帖开始 ==========')
    this.log.info(`标题: ${post.title}`)
    this._dryRun = !!post.dryRun
    if (this._dryRun) this.log.info('[dryRun] 审核模式：填写内容后不点击发布按钮')

    try {
      await this.step1_openPublishPage()

      // 知乎是先填标题/正文，再上传封面图
      await this.step2_inputTitle(post.title)

      // 正文末尾追加 #hashtags（与旧 Playwright 逻辑对齐 L982-987）
      let bodyContent = post.content
      if (post.tags?.length) {
        const hashTags = post.tags.map(t => `#${t.replace(/^#/, '')}`).join(' ')
        bodyContent = `${post.content}\n\n${hashTags}`
      }
      await this.step3_inputContent(bodyContent)

      if (post.images && post.images.length > 0) {
        await this.step4_uploadCover(post.images[0])
      }

      await this.step4b_selectQuestion(post.tags || [])

      if (post.tags && post.tags.length > 0) {
        await this.step5_addTags(post.tags)
      }

      await this.step6_publish()

      // 补足时间到目标总时长
      await this.fillRemainingTime()

      // 发布后继续浏览
      await this.postPublishBrowse()

      this.log.info('========== 知乎发帖成功 ==========')
      return { success: true, message: '发布成功' }

    } catch (err) {
      this.log.error(`知乎发帖失败: ${err.message}`)
      await this.conditionalScreenshot('zhihu_error', 'error')
      return { success: false, message: err.message }
    }
  }

  // ============================================================
  // 各步骤实现
  // ============================================================

  async step1_openPublishPage() {
    this.log.info('[步骤1] 打开知乎写文章页面')
    await this.navigateTo(this.publishUrl)

    // 登录检测
    const currentUrl = this.page.url()
    if (currentUrl.includes(SELECTORS.loginPageIndicator)) {
      throw new Error('未登录或登录已过期，请先在浏览器中登录知乎')
    }

    await this.conditionalScreenshot('zhihu_step1_open', 'step')
    await this.browseForStep('open_page')
  }

  async step2_inputTitle(title) {
    this.log.info('[步骤2] 输入标题')

    const selector = await this.findSelector([
      SELECTORS.titleInput,
      SELECTORS.titleInputAlt,
    ])

    await this.paste(selector, title)
    await this.actionPause()
    await this.conditionalScreenshot('zhihu_step2_title', 'step')
    await this.browseForStep('input_title')
  }

  async step3_inputContent(content) {
    this.log.info('[步骤3] 输入正文')

    const selector = await this.findSelector([
      SELECTORS.contentInput,
      SELECTORS.contentInputAlt,
      SELECTORS.contentInputFallback,
    ])

    // CDP insertText：对 Draft.js / contenteditable 富文本编辑器可靠
    await this.paste(selector, content)
    await this.actionPause()
    await this.conditionalScreenshot('zhihu_step3_content', 'step')
    await this.browseForStep('input_content')
  }

  async step4_uploadCover(imagePath) {
    this.log.info('[步骤4] 上传封面图')

    const absolutePath = path.resolve(imagePath)

    // 滚动到页面底部，确保「发布设置」区域可见
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(800)

    // 等价 Playwright: page.locator("text=添加文章封面").first()
    // 找最内层（textContent 最短）包含目标文本的元素
    const coverBtn = await this.page.evaluateHandle(() => {
      const all = Array.from(document.querySelectorAll('div, span, a, button'))
      const matches = all.filter(d => d.textContent?.includes('添加文章封面'))
      matches.sort((a, b) => (a.textContent?.length || 0) - (b.textContent?.length || 0))
      return matches[0] || null
    })
    const coverEl = coverBtn.asElement()
    if (!coverEl) {
      this.log.warn('  未找到「添加文章封面」按钮，跳过')
      return
    }

    // 1:1 翻译旧 Playwright 逻辑:
    //   const [fileChooser] = await Promise.all([
    //     page.waitForEvent("filechooser", { timeout: 5000 }),
    //     coverBtn.click()
    //   ]);
    //   await fileChooser.setFiles(coverPath);
    this.log.info('  点击「添加文章封面」+ waitForFileChooser...')
    try {
      const [fileChooser] = await Promise.all([
        this.page.waitForFileChooser({ timeout: 5000 }),
        coverEl.click(),
      ])
      await fileChooser.accept([absolutePath])
      this.log.info('  封面文件已传入')
      await sleep(2000)
    } catch (err) {
      this.log.warn(`  waitForFileChooser 失败: ${err.message}`)
    }

    this.log.info('封面图上传完成')
    await this.conditionalScreenshot('zhihu_step4_cover', 'step')
    await this.browseForStep('upload_images')
  }

  /**
   * 投稿至问题（自动选择第一个推荐问题）
   * 翻译自 Playwright zhihuSelectQuestion (playwrightRunner.ts L708-756)
   */
  async step4b_selectQuestion(tags = []) {
    this.log.info('[步骤4b] 投稿至问题')

    try {
      // 滚动到发布设置区域
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await sleep(800)

      // 找"投稿至问题"区域的下拉按钮（button 标签，精确匹配"未选择"）
      const ddHandle = await this.page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        return buttons.find(b => b.textContent.trim() === '未选择') || null
      })
      const dropdownBtn = ddHandle.asElement()
      if (!dropdownBtn) {
        this.log.info('  未找到「未选择」按钮（可能已选过问题），跳过')
        return
      }

      this.log.info('  点击「未选择」下拉框...')
      await dropdownBtn.click()
      await sleep(2000)

      // 用第一个 tag 作为关键词搜索相关问题
      const keyword = tags[0] || ''
      if (keyword) {
        const searchInput = await this.page.$('input[placeholder*="关键"]')
          || await this.page.$('input[placeholder*="问题"]')
        if (searchInput) {
          this.log.info(`  搜索关键词: ${keyword}`)
          await this.page.evaluate(el => { el.focus(); el.value = '' }, searchInput)
          await sleep(200)
          const cdp = await this.page.target().createCDPSession()
          await cdp.send('Input.insertText', { text: keyword })
          await cdp.detach().catch(() => {})
          // 点击搜索按钮或按 Enter
          await this.page.keyboard.press('Enter')
          await sleep(2000)
        }
      }

      // 找精确文本为"选择"的按钮（排除"未选择"等）
      const selectBtnHandle = await this.page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        return buttons.find(b => b.textContent.trim() === '选择') || null
      })
      const selectBtn = selectBtnHandle.asElement()

      if (selectBtn) {
        await selectBtn.click()
        this.log.info('  已点击「选择」按钮')
        await sleep(800)

        // 点击"确定"
        const confirmHandle = await this.page.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button'))
          return buttons.find(b => b.textContent.trim() === '确定') || null
        })
        const confirmBtn = confirmHandle.asElement()
        if (confirmBtn) {
          await confirmBtn.click()
          this.log.info('  已确认投稿问题')
          await sleep(500)
        }
      } else {
        // 无搜索结果，关闭对话框
        await this.page.keyboard.press('Escape').catch(() => {})
        this.log.info('  无匹配问题可选')
      }
    } catch (err) {
      this.log.warn(`  投稿至问题失败: ${err.message}`)
    }
  }

  async step5_addTags(tags) {
    this.log.info(`[步骤5] 添加 ${tags.length} 个话题标签`)

    const searchDelayMin = cfg('steps.add_tags.search_delay_min', 800)
    const searchDelayMax = cfg('steps.add_tags.search_delay_max', 1200)
    const selectDelayMin = cfg('steps.add_tags.select_delay_min', 1000)
    const selectDelayMax = cfg('steps.add_tags.select_delay_max', 2000)

    // 滚动到页面底部，发布设置区域可见
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await randomDelay(500, 1000)

    for (const tag of tags.slice(0, 5)) {
      try {
        // 第一步：点「添加话题」按钮（搜索框才会出现）
        const addBtn = await this.findByText('button', SELECTORS.addTopicButtonText)
        if (!addBtn) {
          this.log.warn('未找到「添加话题」按钮，跳过标签添加')
          break
        }
        await addBtn.click()
        await randomDelay(searchDelayMin, searchDelayMax)

        // 第二步：等待搜索框出现（轮询，最多 8s）
        let tagInput = null
        for (let i = 0; i < 16; i++) {
          tagInput = await this.page.$(SELECTORS.tagInput)
          if (tagInput) break
          await sleep(500)
        }
        if (!tagInput) throw new Error(`话题搜索框未出现 (${SELECTORS.tagInput})`)

        // 第三步：输入话题关键词
        this.log.info(`  输入话题: ${tag}`)
        await this.page.evaluate(el => { el.scrollIntoView(); el.focus() }, tagInput)
        await sleep(300)
        const cdp = await this.page.target().createCDPSession()
        await cdp.send('Input.insertText', { text: tag })
        await cdp.detach().catch(() => {})
        await randomDelay(selectDelayMin, selectDelayMax)

        // 第四步：点击建议列表中的第一个匹配 button（知乎建议项是 180x40 的 button）
        const suggHandle = await this.page.evaluateHandle((tagText) => {
          const buttons = Array.from(document.querySelectorAll('button'))
          // 优先精确匹配
          const exact = buttons.find(b => {
            const r = b.getBoundingClientRect()
            return b.textContent.trim() === tagText && r.height > 20 && r.height < 60
              && window.getComputedStyle(b).cursor === 'pointer'
          })
          if (exact) return exact
          // fallback: 建议列表中第一个（180x40 左右的 button）
          return buttons.find(b => {
            const r = b.getBoundingClientRect()
            return r.width > 100 && r.height > 20 && r.height < 60
              && b.textContent.trim().length < 20
              && b.textContent.trim().length > 0
              && window.getComputedStyle(b).cursor === 'pointer'
              && b.textContent.trim() !== '添加话题'
              && !b.textContent.includes('发布')
              && !b.textContent.includes('预览')
          }) || null
        }, tag)
        const suggBtn = suggHandle.asElement()

        if (suggBtn) {
          const suggText = await this.page.evaluate(el => el.textContent.trim(), suggBtn)
          await suggBtn.click()
          this.log.info(`  话题「${suggText}」已点击选中`)
        } else {
          // 最终 fallback: 按 Enter
          await this.page.keyboard.press('Enter')
          this.log.info(`  话题「${tag}」Enter fallback`)
        }
        await sleep(800)

        // 第五步：Escape 关闭残留下拉
        await this.page.keyboard.press('Escape').catch(() => {})
        await sleep(300)

        // 再滚动到底部
        await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await sleep(300)

      } catch (err) {
        this.log.warn(`  添加标签 "${tag}" 失败: ${err.message}`)
        // 点击空白关闭可能残留的弹窗
        await this.page.mouse.click(100, 400).catch(() => {})
        await sleep(300)
      }
    }

    await this.conditionalScreenshot('zhihu_step5_tags', 'step')
    await this.browseForStep('add_tags')
  }

  async step6_publish() {
    if (this._dryRun) {
      this.log.info('[步骤6] dryRun 模式，内容已填写，等待人工确认后手动点击发布')
      return
    }
    this.log.info('[步骤6] 最终检查并发布')

    const reviewDelayMin = cfg('steps.publish.review_delay_min', 3000)
    const reviewDelayMax = cfg('steps.publish.review_delay_max', 8000)
    const waitAfterMin = cfg('steps.publish.wait_after_min', 5000)
    const waitAfterMax = cfg('steps.publish.wait_after_max', 15000)

    // 上下滚动检查内容
    await this.scroll()
    await randomDelay(reviewDelayMin, reviewDelayMax)

    // 发布前截图
    await this.conditionalScreenshot('zhihu_before_publish', 'before_publish')

    // 查找并点击发布按钮（CSS + 文本匹配 fallback）
    let clicked = false
    try {
      const el = await this.page.$(SELECTORS.publishButton)
      if (el) {
        await this.click(SELECTORS.publishButton)
        clicked = true
      }
    } catch { /* continue */ }

    if (!clicked) {
      const btn = await this.findByText('button', '发布')
      if (btn) {
        await btn.click()
        clicked = true
      }
    }

    if (!clicked) {
      throw new Error('未找到发布按钮，页面结构可能已变更')
    }

    this.log.info('已点击发布按钮')

    // 等待发布结果
    await randomDelay(waitAfterMin, waitAfterMax)

    // 发布后截图
    await this.conditionalScreenshot('zhihu_after_publish', 'after_publish')
  }

}
