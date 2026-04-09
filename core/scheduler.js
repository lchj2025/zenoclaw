import cron from 'node-cron'
import fs from 'fs'
import path from 'path'
import { getLogger } from './logger.js'
import { cfg, getConfig } from './config.js'
import { getBrowser, closePage, disconnectBrowser, acquireBrowserLock } from './browser.js'
import { randomDelay } from './human.js'
import { safeReadJson, safeWriteJson } from './safe-json.js'
import { loadAdapter, loadReader, loadBrowser as loadBrowseAdapter } from '../platforms/loader.js'

// ============================================================
// 帖子数据管理
// ============================================================

function loadPosts(contentFile) {
  const filePath = path.resolve(contentFile)
  if (!fs.existsSync(filePath)) {
    throw new Error(`内容文件不存在: ${filePath}`)
  }
  return safeReadJson(filePath, [])
}

function getNextPendingPost(posts, platform) {
  return posts.find(p => p.status === 'pending' && p.platform === platform)
}

function getPublishedPosts(posts, platform) {
  return posts.filter(p => p.status === 'published' && p.platform === platform)
}

async function updatePost(contentFile, postId, updates) {
  const filePath = path.resolve(contentFile)
  const posts = safeReadJson(filePath, [])
  const post = posts.find(p => p.id === postId)
  if (post) {
    Object.assign(post, updates)
    await safeWriteJson(filePath, posts)
  }
}

// ============================================================
// 标签页关闭（带延迟）
// ============================================================

/**
 * 关闭标签页前执行延迟
 *
 * 配置项:
 *   tab.close_after_operation — 是否自动关闭
 *   tab.close_delay_min/max  — 关闭前延迟
 */
async function closePageWithDelay(page) {
  const log = getLogger()
  const shouldClose = cfg('tab.close_after_operation', true)

  if (!shouldClose) {
    log.info('标签页保持打开（tab.close_after_operation = false）')
    return
  }

  const delayMin = cfg('tab.close_delay_min', 3000)
  const delayMax = cfg('tab.close_delay_max', 15000)
  log.debug('关闭标签页前等待...')
  await randomDelay(delayMin, delayMax)
  await closePage(page)
}

// ============================================================
// 发帖任务（含重试）
// ============================================================

/**
 * 执行一次发帖任务（含重试逻辑）
 *
 * 配置项:
 *   retry.enabled       — 是否启用重试
 *   retry.max_attempts  — 最大重试次数
 *   retry.delay_min/max — 重试前等待
 */
async function executePublishTask(platform, contentFile) {
  const log = getLogger()
  const retryEnabled  = cfg('retry.enabled', true)
  const maxAttempts   = retryEnabled ? cfg('retry.max_attempts', 2) : 0
  const retryDelayMin = cfg('retry.delay_min', 60000)
  const retryDelayMax = cfg('retry.delay_max', 300000)

  let lastError = null

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    if (attempt > 0) {
      log.info(`[${platform}] 第 ${attempt} 次重试...`)
      await randomDelay(retryDelayMin, retryDelayMax)
    }

    const result = await doPublish(platform, contentFile)

    if (result === 'no_post' || result === 'success') return
    if (result === 'fail') {
      lastError = '发帖失败'
      continue
    }
    // result is an error message
    lastError = result
  }

  if (lastError) {
    log.error(`[${platform}] 所有重试均失败: ${lastError}`)
  }
}

/**
 * 单次发帖执行（不含重试）
 * @returns {'no_post'|'success'|'fail'|string}
 */
async function doPublish(platform, contentFile) {
  const log = getLogger()
  let browser = null
  let page = null
  const release = await acquireBrowserLock()

  try {
    const posts = loadPosts(contentFile)
    const post = getNextPendingPost(posts, platform)

    if (!post) {
      log.info(`[${platform}] 没有待发布的帖子，跳过`)
      return 'no_post'
    }

    log.info(`[${platform}] 开始发布: ${post.title}`)
    await updatePost(contentFile, post.id, { status: 'publishing' })

    const result = await getBrowser()
    browser = result.browser
    page = result.page

    const AdapterClass = await loadAdapter(platform)

    const adapter = new AdapterClass(page)
    await adapter.init()

    const publishResult = await adapter.publish(post)

    if (publishResult.success) {
      await updatePost(contentFile, post.id, {
        status: 'published',
        published_at: new Date().toISOString()
      })
      log.info(`[${platform}] 发布成功: ${post.title}`)
      return 'success'
    } else {
      await updatePost(contentFile, post.id, {
        status: 'failed',
        error: publishResult.message,
        failed_at: new Date().toISOString()
      })
      log.error(`[${platform}] 发布失败: ${publishResult.message}`)
      return 'fail'
    }

  } catch (err) {
    log.error(`[${platform}] 发帖任务出错: ${err.message}`)
    log.error(err.stack)
    return err.message
  } finally {
    await closePageWithDelay(page)
    await disconnectBrowser(browser)
    release()
  }
}

// ============================================================
// 数据读取任务
// ============================================================

/**
 * 执行一次数据读取任务
 */
async function executeReadTask(platform, contentFile) {
  const log = getLogger()
  let browser = null
  let page = null
  const release = await acquireBrowserLock()

  try {
    const posts = loadPosts(contentFile)
    const publishedPosts = getPublishedPosts(posts, platform)

    if (publishedPosts.length === 0) {
      log.info(`[${platform}] 没有已发布的帖子需要读取数据，跳过`)
      return
    }

    log.info(`[${platform}] 开始读取 ${publishedPosts.length} 条帖子数据`)

    const result = await getBrowser()
    browser = result.browser
    page = result.page

    const ReaderClass = await loadReader(platform)

    const reader = new ReaderClass(page)
    await reader.init()

    for (const post of publishedPosts) {
      try {
        log.info(`[${platform}] 读取帖子数据: ${post.title}`)
        const stats = await reader.readPostStats(post)

        if (stats) {
          await updatePost(contentFile, post.id, {
            stats: stats,
            stats_updated_at: new Date().toISOString()
          })
          log.info(`[${platform}] "${post.title}" → 阅读:${stats.views || '-'} 点赞:${stats.likes || '-'} 评论:${stats.comments || '-'} 收藏:${stats.collects || '-'}`)
        }
      } catch (err) {
        log.warn(`[${platform}] 读取 "${post.title}" 数据失败: ${err.message}`)
      }
    }

    log.info(`[${platform}] 数据读取完成`)

  } catch (err) {
    log.error(`[${platform}] 数据读取任务出错: ${err.message}`)
    log.error(err.stack)
  } finally {
    await closePageWithDelay(page)
    await disconnectBrowser(browser)
    release()
  }
}

// ============================================================
// 浏览/养号任务
// ============================================================

/**
 * 执行一次浏览/养号任务
 *
 * 配置字段 browse_schedule[].duration_min — 最短浏览时长（分钟，默认 15）
 */
async function executeBrowseTask(platform, durationMin) {
  const log = getLogger()
  let browser = null
  let page = null
  const release = await acquireBrowserLock()

  try {
    log.info(`[养号][${platform}] 开始浏览（目标时长 ${durationMin} 分钟）`)

    const result = await getBrowser()
    browser = result.browser
    page = result.page

    let BrowseClass
    try {
      BrowseClass = await loadBrowseAdapter(platform)
    } catch {
      // 平台未提供专用 browse.js，降级使用 publisher 基类的浏览能力
      const AdapterClass = await loadAdapter(platform)
      BrowseClass = AdapterClass
    }

    const runner = new BrowseClass(page)
    await runner.init()

    if (typeof runner.browse === 'function') {
      await runner.browse({ durationMs: durationMin * 60 * 1000 })
    } else {
      // 基类 fallback：直接调 simulateBrowsing
      const { simulateBrowsing } = await import('./human.js')
      await runner.navigateTo(runner.getHomeUrl ? runner.getHomeUrl() : 'about:blank')
      await simulateBrowsing(page, null, durationMin * 60 * 1000)
    }

    log.info(`[养号][${platform}] 浏览完成`)

  } catch (err) {
    log.error(`[养号][${platform}] 浏览任务出错: ${err.message}`)
    log.error(err.stack)
  } finally {
    await closePageWithDelay(page)
    await disconnectBrowser(browser)
    release()
  }
}

// ============================================================
// 调度器
// ============================================================

/**
 * 启动定时调度
 */
export function startScheduler(config) {
  const log = getLogger()
  const scheduleList = config.schedule || []
  const readScheduleList = config.read_schedule || []

  const browseScheduleList = config.browse_schedule || []
  let taskCount = 0

  // 注册发帖定时任务
  for (const task of scheduleList) {
    if (!task.enabled) {
      log.info(`[发帖][${task.platform}] 已禁用，跳过`)
      continue
    }
    if (!cron.validate(task.cron)) {
      log.error(`[发帖][${task.platform}] 无效的 cron 表达式: ${task.cron}`)
      continue
    }

    cron.schedule(task.cron, async () => {
      log.info(`[发帖][${task.platform}] 定时任务触发`)
      await executePublishTask(task.platform, task.content_file)
    })
    log.info(`[发帖][${task.platform}] 定时任务已注册: ${task.cron}`)
    taskCount++
  }

  // 注册数据读取定时任务
  for (const task of readScheduleList) {
    if (!task.enabled) {
      log.info(`[读取][${task.platform}] 已禁用，跳过`)
      continue
    }
    if (!cron.validate(task.cron)) {
      log.error(`[读取][${task.platform}] 无效的 cron 表达式: ${task.cron}`)
      continue
    }

    cron.schedule(task.cron, async () => {
      log.info(`[读取][${task.platform}] 定时任务触发`)
      await executeReadTask(task.platform, task.content_file)
    })
    log.info(`[读取][${task.platform}] 定时任务已注册: ${task.cron}`)
    taskCount++
  }

  // 注册浏览/养号定时任务
  for (const task of browseScheduleList) {
    if (!task.enabled) {
      log.info(`[养号][${task.platform}] 已禁用，跳过`)
      continue
    }
    if (!cron.validate(task.cron)) {
      log.error(`[养号][${task.platform}] 无效的 cron 表达式: ${task.cron}`)
      continue
    }

    const durationMin = task.duration_min || 15
    cron.schedule(task.cron, async () => {
      log.info(`[养号][${task.platform}] 定时任务触发`)
      await executeBrowseTask(task.platform, durationMin)
    })
    log.info(`[养号][${task.platform}] 定时任务已注册: ${task.cron}（${durationMin} 分钟）`)
    taskCount++
  }

  if (taskCount === 0) {
    log.warn('没有配置任何有效的定时任务')
    return
  }

  log.info(`调度器启动完成，已注册 ${taskCount} 个定时任务，等待触发...`)
  log.info('按 Ctrl+C 退出')
}

/**
 * 立即执行一次发帖
 */
export async function runOnce(platform, config) {
  const log = getLogger()
  const task = (config.schedule || []).find(t => t.platform === platform)
  if (!task) {
    log.error(`未找到平台 ${platform} 的发帖配置`)
    return
  }

  log.info(`[${platform}] 立即执行一次发帖`)
  await executePublishTask(platform, task.content_file)
}

/**
 * 立即执行一次浏览/养号
 */
export async function browseOnce(platform, config) {
  const log = getLogger()
  const task = (config.browse_schedule || []).find(t => t.platform === platform)
    || (config.schedule || []).find(t => t.platform === platform)
  if (!task) {
    log.error(`未找到平台 ${platform} 的配置`)
    return
  }

  const durationMin = task.duration_min || 15
  log.info(`[${platform}] 立即执行一次浏览（${durationMin} 分钟）`)
  await executeBrowseTask(platform, durationMin)
}

/**
 * 立即执行一次数据读取
 */
export async function readOnce(platform, config) {
  const log = getLogger()
  const task = (config.read_schedule || []).find(t => t.platform === platform)
    || (config.schedule || []).find(t => t.platform === platform)
  if (!task) {
    log.error(`未找到平台 ${platform} 的配置`)
    return
  }

  log.info(`[${platform}] 立即执行一次数据读取`)
  await executeReadTask(platform, task.content_file)
}
