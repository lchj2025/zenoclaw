/**
 * 即刻 CSS 选择器集中管理（2026-04-07 实测验证）
 *
 * 发布页面: https://web.okjike.com/following
 * 首页: https://web.okjike.com/
 *
 * 注意: 即刻使用 Mantine UI + CSS Modules，类名有 hash 后缀
 * 优先用 Mantine 组件类、属性选择器、文本匹配
 */

// 发帖页面选择器（实测: web.okjike.com/following）
// 即刻无独立标题字段，只有正文 + 图片
export const PUBLISH_SELECTORS = {
  // 正文输入（实测: .content-editor 内 contenteditable）
  contentInput: '.content-editor [contenteditable="true"]',
  contentInputAlt: "div[contenteditable='true']",

  // 图片上传
  imageInput: "input[type='file']",

  // 发送按钮（实测: button[type="submit"]）
  submitButton: 'button[type="submit"]',
  submitButtonText: '发送',

  // 圈子/话题选择（实测: input[placeholder="未选择圈子"]）
  topicInput: 'input[placeholder*="圈子"]',
  topicInputAlt: '[class*="topic"] input',

  // 登录检测
  loginPageIndicator: '/login',
}

// 数据读取页面选择器（个人主页）
// URL: https://web.okjike.com/u/{userId}
export const READER_SELECTORS = {
  // 个人主页
  profileUrl: 'https://web.okjike.com/u/',
  profileName: '[class*="username"], [class*="UserName"]',
  profileBio: '[class*="bio"], [class*="description"]',

  // 动态列表
  postList: '[class*="MessageList"], [class*="message-list"]',
  postItem: '[class*="MessageItem"], [class*="message-item"]',
  postContent: '[class*="MessageContent"], [class*="content"]',
  postTime: '[class*="time"], time',

  // 动态数据
  postLikes: '[class*="like-count"], [class*="LikeCount"]',
  postComments: '[class*="comment-count"], [class*="CommentCount"]',
  postShares: '[class*="repost-count"], [class*="RepostCount"]',

  // 粉丝/关注
  profileFollowers: '[class*="follower"], [class*="FollowerCount"]',
  profileFollowing: '[class*="following"], [class*="FollowingCount"]',
}

// 浏览/养号选择器（2026-04-07 实测验证）
// URL: https://web.okjike.com/
export const BROWSE_SELECTORS = {
  // 首页（实测: 跳转到 /following）
  homeUrl: 'https://web.okjike.com/',

  // Feed 容器（实测: Mantine ScrollArea）
  feedContainer: '.mantine-ScrollArea-content',
  // Feed 项目（实测: CSS Module hash 类名，用 content 匹配）
  feedContent: '[class*="content"]',
  feedAuthor: '[class*="username"]',

  // 滚动目标（实测: Mantine ScrollArea）
  scrollTarget: '.mantine-ScrollArea-content',
}

// 互动页面选择器（2026-04-07 实测验证）
export const INTERACT_SELECTORS = {
  like: [
    '[class*="likeButton"]',
    '[class*="LikeButton"]',
    // 文本匹配需通过 findByText 实现
  ],
  comment_input: [
    '[contenteditable="true"]',
    'textarea',
  ],
  comment_submit: [
    'button[type="submit"]',
  ],
  follow: [
    'button[class*="follow"]',
    // 文本匹配需通过 findByText('button', '关注') 实现
  ],
}
