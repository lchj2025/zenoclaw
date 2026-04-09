/**
 * 微信视频号 CSS 选择器集中管理（2026-04-07 实测验证）
 *
 * 视频号使用 finder-ui-desktop-* 稳定类名
 * 助手首页: https://channels.weixin.qq.com/platform
 * 发布入口: https://channels.weixin.qq.com/platform/post/create
 */

// 发帖选择器
// URL: https://channels.weixin.qq.com/platform/post/create
// ⚠️ 视频号 SPA 架构：上传表单需点击触发，Puppeteer 新标签页无法静态检测
// 实际发布需在已有登录标签页中操作
export const PUBLISH_SELECTORS = {
  // 登录检测
  loginPageIndicator: '/login',

  // 导航区域（实测: finder-ui-desktop-* 稳定类，post/create 页可见）
  navContainer: '.finder-ui-desktop-menu__wrp',
  navHeader: '.finder-ui-desktop-menu__header',
  navSubItem: '.finder-ui-desktop-sub-menu__item',

  // 视频文件上传（上传表单触发后可见）
  videoInput: 'input[type="file"]',

  // 标题/描述输入（视频号发布页的描述区域）
  titleInput: 'textarea[placeholder*="描述"], input[placeholder*="标题"]',
  descInput: 'textarea[placeholder*="描述"]',
  descInputAlt: "div[contenteditable='true']",

  // 发布按钮（文本匹配，触发后可见）
  publishButtonText: '发表',
}

// 数据读取页面选择器
export const READER_SELECTORS = {
}

// 浏览/养号选择器
// URL: https://channels.weixin.qq.com/platform
export const BROWSE_SELECTORS = {
  homeUrl: 'https://channels.weixin.qq.com/platform',

  // 导航（实测: finder-ui-desktop-* 稳定类）
  navContainer: '.finder-ui-desktop-menu__header',
  navItem: '.finder-ui-desktop-sub-menu__item',
  navLink: '.finder-ui-desktop-menu__link',

  // 内容区
  contentInfo: '.finder-content-info',
  dataContent: '.data-content',
  postPreview: '.post-preview-wrap',

  // 账号信息
  accountInfo: '.account-info',
  menuFooter: '.finder-ui-desktop-menu__footer',

  scrollTarget: '.finder-ui-desktop-menu, body',
}

// 互动选择器
export const INTERACT_SELECTORS = {
  like: [
    '[class*="like"]',
    'button[class*="like"]',
  ],
  comment_input: [
    'textarea[placeholder*="评论"]',
    'div[contenteditable="true"]',
  ],
  comment_submit: [],
  follow: [],
}
