/**
 * 今日头条 CSS 选择器集中管理（2026-04-07 实测验证）
 *
 * 头条使用 byte-* 组件库 + syl-* 编辑器类名
 * 文章发布页: https://mp.toutiao.com/profile_v4/graphic/publish
 * 视频上传页: https://mp.toutiao.com/profile_v4/xigua/upload-video
 * 微头条页:  https://mp.toutiao.com/profile_v4/weitoutiao/publish
 */

// 发帖选择器（文章模式）
// URL: https://mp.toutiao.com/profile_v4/graphic/publish
export const PUBLISH_SELECTORS = {
  // 标题输入（实测: textarea placeholder="请输入文章标题（2～30个字）"）
  titleInput: 'textarea[placeholder*="请输入文章标题"]',

  // 正文输入（实测: div.ProseMirror[contenteditable="true"]）
  contentInput: 'div.ProseMirror[contenteditable="true"]',
  contentInputAlt: '.ProseMirror',

  // 工具栏按钮（实测: button.syl-toolbar-button）
  toolbarButton: 'button.syl-toolbar-button',

  // 发布按钮（文本匹配）
  publishButtonText: '发布',

  // 加入合集按钮（实测: button.byte-btn-default text="添加至合集"）
  collectionButton: 'button.byte-btn-default',

  // 登录检测
  loginPageIndicator: '/login',
}

// 微头条选择器
// URL: https://mp.toutiao.com/profile_v4/weitoutiao/publish
export const MICRO_SELECTORS = {
  contentInput: 'textarea[placeholder*="说点什么"]',
  imageInput: 'input[type="file"]',
  publishButtonText: '发布',
}

// 数据读取页面选择器
export const READER_SELECTORS = {
}

// 浏览/养号选择器
// 注: www.toutiao.com 有反爬限制，改用创作平台主页
export const BROWSE_SELECTORS = {
  homeUrl: 'https://mp.toutiao.com/profile_v4/index',

  // 创作平台主页（实测: .pgc-content + 导航菜单）
  feedContainer: '.pgc-content, .pgc-main',
  menuItem: '.byte-menu-item',
  menuGroup: '.byte-menu-inline',

  // 数据面板
  dataTitle: '.data-board-item-title',

  scrollTarget: '.pgc-content, body',
}

// 互动选择器
export const INTERACT_SELECTORS = {
  like: [
    '[class*="like-btn"]',
    'button[class*="like"]',
  ],
  comment_input: [
    'textarea[placeholder*="评论"]',
    'div[contenteditable="true"]',
  ],
  comment_submit: [],
  follow: [],
}
