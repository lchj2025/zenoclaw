/**
 * 搜狐号 CSS 选择器集中管理（2026-04-09 实测验证）
 *
 * 搜狐号使用 Quill 富文本编辑器
 * 内容管理页: https://mp.sohu.com/mpfe/v4/contentManagement/first/page
 * 文章编辑页: 通过"发布内容"→"文章"导航到达
 */

export const PUBLISH_SELECTORS = {
  // 标题输入（input placeholder 含"标题"）
  titleInput: 'input[placeholder*="标题"]',
  titleInputAlt: 'textarea[placeholder*="标题"]',

  // 正文输入（Quill 编辑器 contenteditable）
  contentInput: '.ql-editor[contenteditable="true"]',
  contentInputAlt: '[contenteditable="true"]',

  // 摘要输入
  summaryInput: 'textarea.abstract-main-textarea',
  summaryInputAlt: 'textarea[placeholder*="摘要"]',

  // 原创声明
  originalText: '原创',

  // 封面上传
  coverUploadText: '上传图片',
  coverFileInput: 'input[type="file"][accept*="image"]',

  // 发布按钮
  publishButtonText: '发布',

  // 内容管理页"发布内容"入口
  publishEntryText: '发布内容',
  articleTabText: '文章',

  // 登录检测
  loginPageIndicator: '/login',
}

export const BROWSE_SELECTORS = {
  homeUrl: 'https://mp.sohu.com/mpfe/v4/contentManagement/first/page',
  scrollTarget: 'body',
}

export const INTERACT_SELECTORS = {
  like: [],
  comment_input: [],
  comment_submit: [],
  follow: [],
}
