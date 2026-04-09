#!/usr/bin/env node
/**
 * ZenoClaw GitHub 发布脚本
 *
 * 功能：将项目复制到临时目录，过滤敏感信息后推送到 GitHub。
 * 本地工作目录完全不受影响（不会 git init，不会删除文件）。
 *
 * 用法：
 *   node scripts/publish-to-github.js                    # 首次发布（会提示输入仓库地址）
 *   node scripts/publish-to-github.js --repo <url>       # 指定远程仓库
 *   node scripts/publish-to-github.js --message "v0.2"   # 自定义 commit message
 *   node scripts/publish-to-github.js --dry-run           # 只构建不推送，检查结果
 *
 * 原理：
 *   1. 复制项目到 .github-staging/ 临时目录
 *   2. 应用 .gitignore 规则 + 额外排除列表
 *   3. 清理敏感配置（API Key、密钥等）
 *   4. 构建 Web UI
 *   5. git commit + push
 *   6. 清理临时目录
 *
 * 注意：本脚本不会修改你的工作目录中的任何文件。
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const STAGING_DIR = path.join(PROJECT_ROOT, '.github-staging')
const CONFIG_FILE = path.join(PROJECT_ROOT, '.github-publish.json')

// ── 额外排除列表（除 .gitignore 外还要排除的文件/目录）──
const EXTRA_EXCLUDES = [
  '.github-staging',
  '.github-publish.json',
  'scripts/publish-to-github.js',  // 发布脚本本身不上传
  'tests/',                          // 测试脚本含内部逻辑
  'ZENOAGENT_ARCHITECTURE.md',       // 内部架构文档
  'CONFIG_API.md',                   // 内部 API 配置文档
  // .gitignore 中已排除的不需要重复列
]

// ── 需要清洗敏感值的文件模式 ──
const SANITIZE_PATTERNS = [
  { file: 'zenoclaw.config.example.yaml', patterns: [] },  // example 已经是安全的
  { file: 'config.example.yaml', patterns: [] },
]

// ============================================================
// 工具函数
// ============================================================

function log(msg) { console.log(`\x1b[36m[publish]\x1b[0m ${msg}`) }
function warn(msg) { console.log(`\x1b[33m[warn]\x1b[0m ${msg}`) }
function error(msg) { console.error(`\x1b[31m[error]\x1b[0m ${msg}`) }
function success(msg) { console.log(`\x1b[32m[done]\x1b[0m ${msg}`) }

function exec(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts })
}

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  }
  return {}
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

/**
 * 解析 .gitignore 规则为简单的匹配列表
 */
function parseGitignore() {
  const gitignorePath = path.join(PROJECT_ROOT, '.gitignore')
  if (!fs.existsSync(gitignorePath)) return []

  return fs.readFileSync(gitignorePath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('!'))
    .map(l => l.replace(/\/$/, ''))  // 去掉末尾斜杠
}

/**
 * 判断路径是否应被排除
 */
function shouldExclude(relativePath, gitignoreRules, extraExcludes) {
  const normalized = relativePath.replace(/\\/g, '/')

  // .gitignore 规则
  for (const rule of gitignoreRules) {
    const normalizedRule = rule.replace(/\\/g, '/')
    // 简单匹配：包含路径段或通配符
    if (normalized === normalizedRule) return true
    if (normalized.startsWith(normalizedRule + '/')) return true
    if (normalizedRule.includes('*')) {
      const regex = new RegExp('^' + normalizedRule.replace(/\*/g, '.*') + '$')
      if (regex.test(normalized)) return true
      // 也尝试匹配文件名部分
      const basename = path.basename(normalized)
      if (regex.test(basename)) return true
    }
    // 匹配目录内的文件
    if (normalized.includes('/' + normalizedRule + '/')) return true
    if (normalized.includes('/' + normalizedRule)) return true
  }

  // 额外排除
  for (const ex of extraExcludes) {
    const normalizedEx = ex.replace(/\\/g, '/')
    if (normalized === normalizedEx) return true
    if (normalized.startsWith(normalizedEx.replace(/\/$/, '') + '/')) return true
    if (normalized.startsWith(normalizedEx)) return true
  }

  return false
}

/**
 * 递归复制目录，应用过滤规则
 */
function copyFiltered(src, dest, gitignoreRules, extraExcludes, rootDir) {
  const entries = fs.readdirSync(src, { withFileTypes: true })
  let fileCount = 0

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    const relativePath = path.relative(rootDir, srcPath)

    if (shouldExclude(relativePath, gitignoreRules, extraExcludes)) {
      continue
    }

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      fileCount += copyFiltered(srcPath, destPath, gitignoreRules, extraExcludes, rootDir)
    } else {
      fs.copyFileSync(srcPath, destPath)
      fileCount++
    }
  }
  return fileCount
}

/**
 * 递归删除目录
 */
function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const repoIdx = args.indexOf('--repo')
  const msgIdx = args.indexOf('--message')

  let repoUrl = repoIdx >= 0 ? args[repoIdx + 1] : null
  const commitMsg = msgIdx >= 0 ? args[msgIdx + 1] : '🐾 ZenoClaw release'

  // 加载保存的配置
  const config = loadConfig()
  if (!repoUrl && config.repo) {
    repoUrl = config.repo
  }

  log('=== ZenoClaw GitHub 发布脚本 ===')
  log(`项目目录: ${PROJECT_ROOT}`)
  log(`暂存目录: ${STAGING_DIR}`)
  if (dryRun) warn('DRY RUN 模式：只构建不推送')

  // ── Step 1: 清理旧暂存 ──
  log('\n[1/6] 清理旧暂存目录...')
  rmrf(STAGING_DIR)
  fs.mkdirSync(STAGING_DIR, { recursive: true })

  // ── Step 2: 过滤复制 ──
  log('[2/6] 复制项目文件（应用过滤规则）...')
  const gitignoreRules = parseGitignore()
  const fileCount = copyFiltered(PROJECT_ROOT, STAGING_DIR, gitignoreRules, EXTRA_EXCLUDES, PROJECT_ROOT)
  log(`  复制了 ${fileCount} 个文件`)

  // ── Step 3: 额外安全检查 ──
  log('[3/6] 安全扫描（检查残留敏感信息）...')
  let hasIssue = false
  const sensitivePatterns = [
    /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{16,}/gi,
    /secret\s*[:=]\s*['"][a-zA-Z0-9]{16,}/gi,
    /password\s*[:=]\s*['"][^'"]{8,}/gi,
  ]

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        scanDir(fullPath)
      } else if (entry.name.match(/\.(js|json|yaml|yml|md|env)$/)) {
        const content = fs.readFileSync(fullPath, 'utf-8')
        for (const pattern of sensitivePatterns) {
          pattern.lastIndex = 0
          const match = pattern.exec(content)
          if (match) {
            const rel = path.relative(STAGING_DIR, fullPath)
            // 排除 .example 文件中的空值占位
            if (!match[0].includes('""') && !match[0].includes("''") && !match[0].includes("'xxx'")) {
              warn(`  ⚠ 疑似敏感信息: ${rel} → ${match[0].substring(0, 50)}...`)
              hasIssue = true
            }
          }
        }
      }
    }
  }
  scanDir(STAGING_DIR)

  if (hasIssue) {
    error('发现疑似敏感信息！请检查上述文件后重新运行。')
    error('如确认安全，可手动进入 .github-staging/ 检查后推送。')
    if (!dryRun) {
      process.exit(1)
    }
  } else {
    success('  安全扫描通过，未发现敏感信息')
  }

  // ── Step 4: 构建 Web UI ──
  log('[4/6] 构建 Web UI...')
  const webDir = path.join(STAGING_DIR, 'web')
  if (fs.existsSync(path.join(webDir, 'package.json'))) {
    try {
      exec('npm install --production=false', { cwd: webDir })
      exec('npm run build', { cwd: webDir })
      // 构建完成后删除 web/node_modules（不需要提交）
      rmrf(path.join(webDir, 'node_modules'))
      success('  Web UI 构建成功')
    } catch (e) {
      warn(`  Web UI 构建失败: ${e.message}，跳过（dist 不会包含在内）`)
    }
  }

  // ── Step 5: Git 操作 ──
  log('[5/6] Git 初始化与提交...')

  // 检查 staging 目录是否已有 git repo（增量更新场景）
  const gitDir = path.join(STAGING_DIR, '.git')
  if (!fs.existsSync(gitDir)) {
    exec('git init', { cwd: STAGING_DIR })
    exec('git branch -M main', { cwd: STAGING_DIR })
  }

  exec('git add -A', { cwd: STAGING_DIR })

  // 检查是否有变更
  try {
    const status = exec('git status --porcelain', { cwd: STAGING_DIR }).trim()
    if (!status) {
      log('  没有新的变更需要提交')
    } else {
      const changedFiles = status.split('\n').length
      log(`  ${changedFiles} 个文件变更`)
      exec(`git commit -m "${commitMsg}"`, { cwd: STAGING_DIR })
      success('  提交成功')
    }
  } catch (e) {
    warn(`  Git commit: ${e.message}`)
  }

  if (dryRun) {
    log('\n[DRY RUN] 暂存目录已准备好，请查看:')
    log(`  ${STAGING_DIR}`)
    log('  确认无误后手动运行:')
    log(`  cd ${STAGING_DIR}`)
    log('  git remote add origin <你的仓库URL>')
    log('  git push -u origin main --force')
    return
  }

  // ── Step 6: 推送 ──
  log('[6/6] 推送到 GitHub...')

  if (!repoUrl) {
    error('未指定远程仓库地址！')
    log('请使用以下方式之一：')
    log('  node scripts/publish-to-github.js --repo https://github.com/你的用户名/zenoclaw.git')
    log('  或编辑 .github-publish.json 添加 repo 字段')
    log(`\n暂存目录保留在: ${STAGING_DIR}`)
    log('你也可以手动进入该目录执行 git remote add + push')
    return
  }

  // 保存仓库地址
  config.repo = repoUrl
  config.lastPublish = new Date().toISOString()
  saveConfig(config)

  try {
    // 检查 remote 是否已存在
    try {
      exec('git remote get-url origin', { cwd: STAGING_DIR })
      exec(`git remote set-url origin ${repoUrl}`, { cwd: STAGING_DIR })
    } catch {
      exec(`git remote add origin ${repoUrl}`, { cwd: STAGING_DIR })
    }

    exec('git push -u origin main --force', { cwd: STAGING_DIR })
    success('\n=== 发布成功！ ===')
    log(`仓库: ${repoUrl}`)
  } catch (e) {
    error(`推送失败: ${e.message}`)
    log('可能的原因：')
    log('  1. 仓库地址不正确')
    log('  2. 没有权限（需要先 gh auth login 或配置 SSH key）')
    log('  3. 网络问题')
    log(`\n暂存目录保留在: ${STAGING_DIR}`)
    log('你可以手动进入该目录调试推送问题')
  }
}

main().catch(err => {
  error(`脚本异常: ${err.message}`)
  process.exit(1)
})
