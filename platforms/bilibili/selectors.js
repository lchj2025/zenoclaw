/**
 * B站 (Bilibili) CSS 选择器集中管理（2026-04-07 实测验证）
 *
 * B站使用 bili-* 前缀类名（首页）+ vui_* 组件类名（编辑器 iframe 内）
 * 首页: https://www.bilibili.com/
 * 投稿页: https://member.bilibili.com/platform/upload/text/new-edit
 *
 * ❗ 专栏编辑器在 iframe 内: https://member.bilibili.com/york/read-editor?
 * 操作这些选择器时需要先 switchToFrame()
 */

// 发帖选择器
// URL: https://member.bilibili.com/platform/upload/text/new-edit
// 
// ⚠️ 实测结论（2026-04-07）：
//    主页面 完全没有 input/textarea/button
//    标题输入、正文编辑器、发布按钮 全在 york/read-editor iframe 内
//    必须先 frame = await frameEl.contentFrame()，再在 frame 内操作
export const PUBLISH_SELECTORS = {
  // 正确发布页 URL（实测: /edit 会重定向到 /new-edit）
  publishUrl: 'https://member.bilibili.com/platform/upload/text/new-edit',

  // iframe 选择器（在主页面匹配，然后 .contentFrame() 切换进去）
  editorFrame: 'iframe[src*="read-editor"]',

  // 标题输入（实测: iframe 内 textarea.title-input__inner
  //          placeholder="请输入标题（建议30字以内）"）
  titleInput: 'textarea[placeholder*="请输入标题"]',
  titleInputAlt: '.title-input__inner',

  // 正文输入（实测: iframe 内 TipTap/ProseMirror 编辑器）
  contentInput: '.tiptap.ProseMirror.eva3-editor',
  contentInputAlt: '.eva3-editor',

  // 发布按钮（实测: iframe 内 button.vui_button--blue 文本"发布"）
  publishButton: 'button.vui_button--blue',
  publishButtonText: '发布',

  // 话题按钮
  topicButton: 'button.topic-button',

  // 登录检测
  loginPageIndicator: '/login',
}

// 数据读取页面选择器
// B站创作中心: https://member.bilibili.com/platform/home
export const READER_SELECTORS = {
}

// 浏览/养号选择器（2026-04-07 实测验证）
// URL: https://www.bilibili.com/
export const BROWSE_SELECTORS = {
  homeUrl: 'https://www.bilibili.com/',

  // Feed（实测: .bili-video-card 视频卡片, .feed-card 信息流卡片）
  feedContainer: 'main.bili-feed4-layout, .feed2',
  feedItem: '.bili-video-card, .bili-feed-card',
  feedTitle: '.bili-video-card__info--tit, .carousel-footer-title',
  feedAuthor: '.bili-video-card__info--author',

  // 推荐轮播（实测: .recommended-swipe）
  recommendSwipe: '.recommended-swipe',

  // 频道导航（实测: .channel-icons__item）
  channelItem: '.channel-icons__item',

  // 搜索（实测: input.nav-search-input）
  searchInput: 'input.nav-search-input',

  // 导航入口
  navUpload: '.right-entry-item--upload',
  navDynamic: 'a.channel-icons__item',

  // 滚动目标
  scrollTarget: 'main.bili-feed4-layout, .feed2',
}

// 互动选择器（2026-04-07 实测）
export const INTERACT_SELECTORS = {
  like: [
    '.video-like',
    'button[class*="like"]',
  ],
  comment_input: [
    'textarea[placeholder*="评论"]',
    'div[contenteditable="true"]',
  ],
  comment_submit: [
    // 文本匹配: findByText('button', '发布')
  ],
  follow: [
    // 文本匹配: findByText('button', '关注')
  ],
}
