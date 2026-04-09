/**
 * 微信公众号 CSS 选择器集中管理（2026-04-09 实测验证）
 *
 * 微信公众号使用 ProseMirror 富文本编辑器
 * 后台首页: https://mp.weixin.qq.com/
 * 编辑器: 通过"新的创作"→"文章"打开新标签页
 * 编辑器URL: https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77
 */

export const PUBLISH_SELECTORS = {
  // 标题输入（textarea#title）
  titleInput: 'textarea#title',
  titleInputAlt: 'textarea.js_title',

  // 正文输入（ProseMirror contenteditable）
  contentInput: '.ProseMirror[contenteditable="true"]',
  contentInputAlt: '#js_editor [contenteditable="true"]',

  // 作者输入
  authorInput: 'input#author',
  authorInputAlt: 'input.js_author',

  // 摘要/描述
  digestInput: 'textarea#js_description',
  digestInputAlt: 'textarea.js_desc',

  // 封面图上传
  coverFileInput: 'input[type="file"][accept*="image"]',

  // 原创声明 checkbox
  originalCheckbox: 'input.js_claim_source',
  originalCheckboxAlt: 'input[class*="claim"]',

  // 发表按钮
  publishButtonClass: '.mass_send',
  publishButtonText: '发表',

  // 保存草稿
  saveDraftText: '草稿',

  // 预览
  previewText: '预览',

  // 创建入口
  createEntryText: '新的创作',
  articleMenuText: '文章',

  // 登录检测
  loginPageIndicator: '/login',
}

export const BROWSE_SELECTORS = {
  homeUrl: 'https://mp.weixin.qq.com/',
  scrollTarget: 'body',
}

export const INTERACT_SELECTORS = {
  like: [],
  comment_input: [],
  comment_submit: [],
  follow: [],
}
