墨韵战纪 v4 · 纸墨主题升级说明
================================

主题重铸：宋清文人画美学 × 反模板校准（taste-literati-brush × anthropic-frontend-design）

字体
- 内置霞鹜文楷（沙箱字库直取，pyftsubset 子集化 25MB→约 810KB/字重）
- Regular 正文 / Medium 标题（500-900 映射），全局一文楷到底
- 移除 Google Fonts 外链，离线可玩；index.html 预加载两个 woff2

设计令牌（src/index.css 全新）
- 宣纸四阶：paper #E9E3D4 / soft / deep / edge（冷调绢白，刻意避开 AI 模板暖奶油）
- 墨色四阶：焦 #141519 → 淡 #90959B
- 朱砂印泥 #A63A2A 仅作印章与主 CTA；黛青 #3D5A66 作交互色
- 矿物辅色：石绿/赭石/青金/藤黄
- 组件类：paper-grain 纸纹 / scroll-mount 装裱立轴 / seal 印章 /
  btn-seal·btn-ink·btn-ink-quiet·btn-night 印式按钮 / rule-zhusi 朱丝栏 /
  verse-v 竖排题跋 / panel-paper·panel-night 纸面板与夜面板

页面重塑
- 主菜单：宣纸卷面 + 远山淡墨 + 「墨」字钤印 + 竖排题跋签条 + 装裱画框
- 选折页：经折装册页（折序方章 + 朱丝左界引文 + 首领战钤印；无尽卷为夜色折页）
- 翰墨赋诗阁：朱丝栏章节双线 + 简牍纸条 + 印式研习按钮
- 结算：立轴捷报（「捷/思」钤印 + 题跋诗句 + 矿物色统计）
- 暂停：立轴「歇」印菜单
- 成就 → 文心印谱：印成者朱、未悟者白
- 墨灵祝福：夜幕悬三张灵符纸签（凡品墨/珍品黛青/绝品朱砂）
- 兵法心诀：装裱卷宗
- 战场：HUD 保持夜色（纸夜二元），教学卡改为纸上便签

验证
- tsc 零错误；vite build 成功；字体正确 hash 打包
- agent-browser 全链路冒烟：菜单/选折/墨阁/战斗/暂停/印谱/心诀/390px 窄屏，控制台零错误
