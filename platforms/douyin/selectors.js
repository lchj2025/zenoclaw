/**
 * 抖音 CSS 选择器集中管理（2026-04-07 实测验证）
 *
 * 抖音使用 semi-* 组件库 + douyin-creator-master-* 稳定类名 + CSS Module hash（不稳定）
 * 创作者中心首页: https://creator.douyin.com/
 * 视频上传页: https://creator.douyin.com/creator-micro/content/upload?enter_from=dou_web
 * 图文发布页: https://creator.douyin.com/creator-micro/content/post/imgtext
 * 文章发布页: https://creator.douyin.com/creator-micro/content/post/article
 */

// 发帖选择器（视频上传为主要发布方式）
// URL: https://creator.douyin.com/creator-micro/content/upload?enter_from=dou_web
export const PUBLISH_SELECTORS = {
  // 视频文件上传（实测: input[type="file"] 在上传区域内）
  videoInput: 'input[type="file"]',

  // 上传按钮（实测: button.semi-button-primary 文本"上传视频"）
  uploadButton: 'button.semi-button-primary',
  uploadButtonText: '上传视频',

  // 标题输入（图文发布页）
  titleInput: 'input[placeholder*="标题"], textarea[placeholder*="标题"]',

  // 发布标签页切换（实测: douyin-creator-master-* 稳定类）
  publishTabVideo: '.douyin-creator-master-navigation',
  publishTabText: '发布图文',

  // 发布按钮（实测: 上传视频后的发布按钮）
  publishButton: 'button.douyin-creator-master-button-primary',
  publishButtonText: '发布',

  // 登录检测
  loginPageIndicator: '/login',
}

// 数据读取页面选择器
export const READER_SELECTORS = {
}

// 浏览/养号选择器
// URL: https://www.douyin.com/
export const BROWSE_SELECTORS = {
  homeUrl: 'https://www.douyin.com/',

  // Feed（实测: www.douyin.com 首页视频卡片）
  feedItem: '[class*="video-card"], [class*="feed-card"]',

  // 搜索（实测: 抖音主站顶部搜索框）
  searchInput: 'input[placeholder*="搜索"]',
}

// 互动选择器
export const INTERACT_SELECTORS = {
  like: [
    '[class*="like-btn"]',
    '[class*="like-icon"]',
    'button[class*="like"]',
  ],
  comment_input: [
    'textarea[placeholder*="评论"]',
    'div[contenteditable="true"]',
  ],
  comment_submit: [],
  follow: [],
}
