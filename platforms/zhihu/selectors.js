/**
 * 知乎 CSS 选择器集中管理（2026-04-07 实测验证）
 *
 * 发布页面: https://zhuanlan.zhihu.com/write
 * 创作中心: https://www.zhihu.com/creator/manage/creation/all
 * 首页: https://www.zhihu.com/
 */

// 发帖页面选择器（实测: zhuanlan.zhihu.com/write）
export const PUBLISH_SELECTORS = {
  // 标题输入（实测: label.WriteIndex-titleInput 内嵌 textarea[name="title"]）
  titleInput: 'label.WriteIndex-titleInput textarea',
  titleInputAlt: 'textarea[placeholder*="\u6807\u9898"]',

  // 正文输入（实测: Draft.js 编辑器）
  contentInput: '.Editable-content.RichText',
  contentInputAlt: 'div.public-DraftEditor-content',
  contentInputFallback: 'div[contenteditable="true"]',

  // 封面图上传
  imageInput: 'input[type="file"]',

  // 发布按钮（实测: button.Button--primary 文本"发布"）
  publishButton: 'button.Button--primary',
  publishButtonText: '发布',

  // 发布设置（实测: 右侧面板）
  publishSettingsText: '发布设置',
  addCoverText: '添加封面',

  // 话题标签（先点「添加话题」按钮，搜索框才出现）
  addTopicButtonText: '添加话题',
  tagInput: 'input[placeholder*="搜索话题"]',
  tagSuggestion: '.WriteIndex-topicItem, .TopicItem, [class*="topicItem"], [class*="TopicItem"]',

  // 登录检测
  loginPageIndicator: '/signin',
}

// 数据读取页面选择器（创作者中心）（2026-04-07 实测验证）
// URL: https://www.zhihu.com/creator/manage/creation/all
export const READER_SELECTORS = {
  // 创作者中心导航
  homeUrl: 'https://www.zhihu.com/creator/manage/creation/all',

  // 创作者主框架（实测: .Creator.Creator--v2 → .Creator-mainColumn）
  creatorContainer: '.Creator.Creator--v2',
  creatorMainColumn: '.Creator-mainColumn',
  creatorLevelInfo: '.LevelInfoV2-creatorInfo',
  creatorLevelImage: '.CreatorHomeLevelImage',

  // 侧边栏菜单（CSS Module 类名不可靠，用文本匹配）
  navContentManageText: '内容管理',
  navDataAnalysisText: '数据分析',
  navContentAnalysisText: '内容分析',
  navFollowerAnalysisText: '关注者分析',

  // 内容管理页 — 标签页（实测: a.Tabs-link）
  contentTabs: 'a.Tabs-link',
  contentTabActive: 'a.Tabs-link.is-active',

  // 内容管理页 — 日期筛选（实测: .CreatorRangePicker）
  dateRangePicker: '.CreatorRangePicker',

  // 内容管理页 — 内容卡片操作（实测: .CreationCard-ActionButton）
  contentCardAction: '.CreationCard-ActionButton',
  // 统计标签文本: 阅读/赞同/评论/收藏/喜欢 (通过 findByText 匹配)
}

// 浏览/养号选择器（2026-04-07 实测验证）
// URL: https://www.zhihu.com/
export const BROWSE_SELECTORS = {
  // 首页
  homeUrl: 'https://www.zhihu.com/',
  // 主结构（实测: main.App-main → .Topstory）
  appMain: 'main.App-main',
  topstory: '.Topstory',

  // Feed（实测: .TopstoryItem 内嵌 .ContentItem）
  feedItem: '.TopstoryItem',
  feedContent: '.RichText.ztext',
  feedReadMore: 'button.ContentItem-more',

  // 互动按钮（实测: button.VoteButton / button.ContentItem-action）
  voteUp: 'button.VoteButton',
  voteDown: 'button.VoteButton.VoteButton--down',
  contentAction: 'button.ContentItem-action',

  // 搜索（实测: input#Popover1-toggle + button.SearchBar-searchButton）
  searchInput: 'input#Popover1-toggle',
  searchButton: 'button.SearchBar-searchButton',

  // 顶部发帖区域（实测: 文本匹配）
  postThoughtText: '发想法',
  askQuestionText: '提问题',
  writeAnswerText: '写回答',
  writeArticleText: '写文章',

  // 滚动目标
  scrollTarget: 'main.App-main',
}

// 互动页面选择器（2026-04-07 实测验证）
// 数组形式，按优先级排列，支持 fallback
export const INTERACT_SELECTORS = {
  like: [
    'button.VoteButton',
    // 文本包含 "赞同 N"
  ],
  collect: [
    'button[aria-label*="收藏"]',
    // 文本匹配需通过 findByText 实现
  ],
  comment_input: [
    'textarea[placeholder*="写下你的评论"]',
    'textarea[placeholder*="评论"]',
  ],
  comment_submit: [
    // 文本匹配需通过 findByText('button', '发布评论') 实现
  ],
  follow: [
    '.FollowButton:not(.is-followed)',
    'button[class*="follow"]',
    // 文本匹配需通过 findByText('button', '关注') 实现
  ],
}
