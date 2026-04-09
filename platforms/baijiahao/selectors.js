/**
 * 百家号 CSS 选择器集中管理（2026-04-09 实测验证）
 *
 * 百家号使用 UEditor iframe 富文本编辑器
 * 文章发布页: https://baijiahao.baidu.com/builder/rc/edit?type=news
 */

export const PUBLISH_SELECTORS = {
  // 标题输入（textarea placeholder="请输入标题（2-64字）" 或 AI生成入口）
  titleInput: 'textarea[placeholder*="标题"]',
  titleInputAlt: 'input[placeholder*="标题"]',

  // 正文输入（iframe 内 body contenteditable, class="view news-editor-pc"）
  contentIframeBody: 'body[contenteditable="true"]',
  contentIframeBodyAlt: 'body.view',

  // 封面图上传
  coverFileInput: 'input[type="file"]',

  // 封面设置区域
  coverSetting: '[class*="cover"]',

  // 发布按钮
  publishButtonText: '发布',

  // 保存草稿
  saveDraftText: '保存',

  // 登录检测
  loginPageIndicator: '/passport',
}

export const BROWSE_SELECTORS = {
  homeUrl: 'https://baijiahao.baidu.com/builder/rc/home',
  scrollTarget: 'body',
}

export const INTERACT_SELECTORS = {
  like: [],
  comment_input: [],
  comment_submit: [],
  follow: [],
}
