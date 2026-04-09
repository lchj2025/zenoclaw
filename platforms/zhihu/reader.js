import { BasePlatformAdapter } from '../base.js'
import { randomDelay } from '../../core/human.js'
import { READER_SELECTORS } from './selectors.js'

/**
 * 知乎数据读取器
 *
 * 从知乎创作者中心或文章页面读取数据统计
 *
 * 最后验证: 2026-04（基于页面结构推断，需实测验证）
 */

const SELECTORS = READER_SELECTORS

export class ZhihuReader extends BasePlatformAdapter {
  constructor(page) {
    super(page)
    this.platformName = 'zhihu'
  }

  /**
   * 读取单篇文章的统计数据
   * @param {object} post - { post_url, title }
   * @returns {Promise<{views: number, likes: number, comments: number, collects: number}|null>}
   */
  async readPostStats(post) {
    if (!post.post_url) {
      this.log.warn(`[知乎Reader] 帖子 "${post.title}" 无 URL，跳过`)
      return null
    }

    this.log.info(`[知乎Reader] 读取: ${post.title}`)

    try {
      await this.navigateTo(post.post_url)
      await randomDelay(6000, 8000) // 知乎 React feed 需要较长渲染时间

      const stats = await this.page.evaluate(() => {
        const parseNum = (text) => {
          if (!text) return 0
          const clean = text.trim().replace(/[，,\s​]/g, '') // 含零宽空格
          if (clean.includes('万')) return Math.floor(parseFloat(clean) * 10000)
          if (clean.toLowerCase().includes('k')) return Math.floor(parseFloat(clean) * 1000)
          return parseInt(clean.replace(/[^0-9]/g, ''), 10) || 0
        }

        // 实测确认（2026-04）：知乎赞同按钮 aria-label="赞同 N "
        let likes = 0
        for (const btn of document.querySelectorAll('button[aria-label]')) {
          const label = btn.getAttribute('aria-label') || ''
          if (label.includes('赞同')) {
            const m = label.match(/(\d[\d,万k.]+)/i)
            if (m) { likes = parseNum(m[1]); break }
          }
        }

        // 评论按钮文本含"条评论"
        let comments = 0
        for (const btn of document.querySelectorAll('button')) {
          const t = (btn.textContent || '').trim()
          if (t.includes('条评论')) {
            const m = t.match(/(\d[\d,万k.]+)/)
            if (m) { comments = parseNum(m[1]); break }
          }
        }

        return {
          likes,
          comments,
          views: 0,    // 知乎文章页面不直接显示浏览量
          collects: 0, // 收藏数需从创作者中心获取
        }
      })

      return stats
    } catch (err) {
      this.log.warn(`[知乎Reader] 读取 "${post.title}" 失败: ${err.message}`)
      return null
    }
  }

  /**
   * 批量读取所有文章统计
   * 从知乎创作者中心的内容管理页面读取
   */
  async readAllPostStats() {
    const creatorUrl = 'https://www.zhihu.com/creator/content/article'
    this.log.info(`[知乎Reader] 批量读取文章数据`)

    try {
      await this.navigateTo(creatorUrl)
      await randomDelay(3000, 5000)

      const articles = await this.page.evaluate(() => {
        const items = document.querySelectorAll('.ContentItem, .css-1g9n2l4')
        const results = []

        items.forEach(item => {
          const titleEl = item.querySelector('.ContentItem-title a, a[class*="title"]')
          const title = titleEl ? titleEl.textContent.trim() : ''
          const url = titleEl ? titleEl.href : ''

          // 尝试从元素中提取统计数据
          const metaEls = item.querySelectorAll('.ContentItem-meta span, [class*="meta"] span')
          let views = 0, likes = 0, comments = 0

          metaEls.forEach(el => {
            const text = el.textContent.trim()
            if (text.includes('阅读')) views = parseInt(text.replace(/[^0-9]/g, '')) || 0
            if (text.includes('赞同')) likes = parseInt(text.replace(/[^0-9]/g, '')) || 0
            if (text.includes('评论')) comments = parseInt(text.replace(/[^0-9]/g, '')) || 0
          })

          if (title) {
            results.push({ title, url, views, likes, comments, collects: 0 })
          }
        })

        return results
      })

      this.log.info(`[知乎Reader] 读取到 ${articles.length} 篇文章`)
      return articles
    } catch (err) {
      this.log.error(`[知乎Reader] 批量读取失败: ${err.message}`)
      return []
    }
  }
}
