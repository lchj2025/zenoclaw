/**
 * zenoclaw/sdk/publish-post.js
 *
 * CLI bridge：通过 CDP 连接已打开的 Chrome，调用 zenoclaw 适配器发布内容
 * 由 executor 通过 child_process.spawn 调用，无需启动 zenoclaw API server
 *
 * 用法:
 *   node zenoclaw/sdk/publish-post.js \
 *     --platform xiaohongshu \
 *     --title "标题" \
 *     --content "正文内容" \
 *     --images "/path/a.jpg,/path/b.jpg" \
 *     --tags "宝藏APP,AI助手" \
 *     --mode publish \
 *     [--schedule "2026-04-10T10:00:00Z"] \
 *     [--port 9222]
 *
 * 输出 (stdout):
 *   成功: { "success": true, "message": "发布成功", "taskStatus": "completed" }
 *   审核: { "success": true, "message": "内容已填写，等待人工确认", "taskStatus": "review_required" }
 *   失败: { "success": false, "message": "错误信息", "taskStatus": "failed" }
 *
 * 退出码: 0 成功/审核, 1 失败
 */
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { loadAdapter } from '../platforms/loader.js'
import { initConfig } from '../core/config.js'

puppeteer.use(StealthPlugin())

function parseArgs() {
  const args = process.argv.slice(2)
  const result = {
    platform: null,
    title: '',
    content: '',
    images: [],
    tags: [],
    mode: 'review',
    schedule: null,
    port: 9222
  }
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--platform': result.platform  = args[++i]; break
      case '--title':    result.title     = args[++i]; break
      case '--content':  result.content   = args[++i]; break
      case '--images':   result.images = (args[++i] || '').split(',').filter(Boolean); break
      case '--tags':     result.tags      = (args[++i] || '').split(',').filter(Boolean); break
      case '--mode':     result.mode      = args[++i]; break
      case '--schedule': result.schedule  = args[++i]; break
      case '--port':     result.port      = parseInt(args[++i], 10); break
    }
  }
  return result
}

function output(data) {
  process.stdout.write(JSON.stringify(data))
}

async function connectChrome(port) {
  const resp = await fetch(`http://127.0.0.1:${port}/json/version`)
  if (!resp.ok) throw new Error(`Chrome 调试端口 ${port} 不可用`)
  const data = await resp.json()
  if (!data.webSocketDebuggerUrl) throw new Error('未找到 Chrome webSocketDebuggerUrl')
  return puppeteer.connect({
    browserWSEndpoint: data.webSocketDebuggerUrl,
    defaultViewport: null
  })
}

/**
 * fast-mode 配置：关闭所有 browseForStep 和使用模拟延迟
 * executor 按需调用时不需要数分钟的人工模拟，快速完成即可
 */
function initFastMode() {
  initConfig({
    steps: {
      open_page:     { browse_min: 0, browse_max: 0 },
      upload_images: { browse_min: 0, browse_max: 0 },
      input_title:   { browse_min: 0, browse_max: 0 },
      input_content: { browse_min: 0, browse_max: 0 },
      add_tags:      { browse_min: 0, browse_max: 0, search_delay_min: 800, search_delay_max: 1200, select_delay_min: 1500, select_delay_max: 2500 },
      publish:       { browse_min: 0, browse_max: 0, review_delay_min: 1500, review_delay_max: 3000, wait_after_min: 3000, wait_after_max: 6000 },
    },
    timing: {
      action_delay_min: 300,
      action_delay_max: 800,
      total_duration_min: 0,
      total_duration_max: 0,
      post_navigation_delay_min: 1000,
      post_navigation_delay_max: 2000,
    },
    tab: {
      post_publish_browse_min: 0,
      post_publish_browse_max: 0,
    },
    keyboard: {
      delay_min: 30,
      delay_max: 80,
      pause_chance: 0,
      pre_type_delay_min: 200,
      pre_type_delay_max: 400,
    },
    scroll: {
      times_min: 0,
      times_max: 1,
    },
    screenshot: {
      on_each_step: false,
      on_error: false,
      on_before_publish: false,
      on_after_publish: false,
    },
    browser: {
      navigation_timeout: 30000,
      element_timeout: 15000,
    },
    upload: {
      wait_after_select_min: 1000,
      wait_after_select_max: 2000,
      processing_poll_interval: 3000,
      processing_poll_max_attempts: 10,
    },
    mouse: {
      click_offset_percent: 10,
      click_wait_min: 50,
      click_wait_max: 150,
    },
  })
}

async function main() {
  initFastMode()
  const args = parseArgs()

  if (!args.platform) {
    output({ success: false, message: '缺少 --platform 参数', taskStatus: 'failed' })
    process.exit(1)
  }
  if (!args.title) {
    output({ success: false, message: '缺少 --title 参数', taskStatus: 'failed' })
    process.exit(1)
  }

  // 规范化平台名：xiaohongshu-2 → xiaohongshu（zenoclaw按目录名加载）
  const zenocrawPlatform = args.platform.replace(/-\d+$/, '')

  let browser = null
  let page = null
  let post = null

  try {
    browser = await connectChrome(args.port)
    page = await browser.newPage()

    const AdapterClass = await loadAdapter(zenocrawPlatform)
    const adapter = new AdapterClass(page)
    await adapter.init()

    post = {
      title:        args.title,
      content:      args.content,
      images:       args.images,
      tags:         args.tags,
      scheduleTime: args.schedule || undefined,
      dryRun:       args.mode !== 'publish'
    }

    const result = await adapter.publish(post)

    const taskStatus = !result.success
      ? 'failed'
      : post.dryRun
        ? 'review_required'
        : 'completed'

    output({ ...result, taskStatus })
    if (!result.success) process.exitCode = 1

  } catch (err) {
    output({ success: false, message: err.message, taskStatus: 'failed' })
    process.exitCode = 1
  } finally {
    // review (dryRun) 模式：保留页面供用户审核手动发布（与老流程一致）
    // publish 模式：发布完成后关闭标签页
    const isDryRun = post && post.dryRun
    if (page && !isDryRun) await page.close().catch(() => {})
    if (browser) browser.disconnect()
  }
}

main()
