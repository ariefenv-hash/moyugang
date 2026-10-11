# 墨韵战纪：风雅篇

以宣纸为局、以墨为刃的水墨风火柴人动作游戏。扮演诗剑剑仙，穿行五折山水之间，以笔意御剑，以字诀出招。

基于 React + Vite + Canvas 构建，支持安装为 PWA 并完全离线游玩。

**在线游玩（GitHub Pages）：`https://ariefenv-hash.github.io/moyugang/`**（推送 main 后 Actions 自动构建部署）

## 游戏特性

- **五折战役 + 无尽卷** —— 五幕水墨篇章各有独立场景与敌阵，外加挑战极限的无尽模式
- **双武器系统** —— 「墨锋·青霜剑」三段连击、重斩震退；「青罗伞」旋伞回雪周身击退、护盾加厚、身法轻捷；战斗中 V 键或按钮实时切换
- **剑仙技能体系** —— 七式技能：断水斩 / 竹影墨盾 / 星河笔阵 / 三江引·墨浪 / 墨心归元 / 临江仙大招，矢量武器与专门调校的打击感（顿帧、斩击闪白、墨滴飞溅）
- **七字字诀手势识别** —— 基于 $P 点云匹配的汉字笔划识别（之山火水川心王），支持连笔变体与朱印评级（神品/妙品/能品），写错可「退笔 / 重写」
- **四大趣味机制** —— 祝福、文房四宝、墨龙、墨滞，为战局注入变量
- **PWA 完整支持** —— 主屏幕安装、Service Worker 预缓存离线可玩、自动检测新版本并提供更新提示

## 操作方式

- 桌面端：WASD 移动，J 攻击，Q/W/E/R 技能，V 切换武器，C 字诀模式
- 移动端：点地漫步、划手势施法、字诀模式下逐笔书写汉字，完整手势操作

## 本地开发

```bash
# 安装依赖（亦可用 npm / pnpm）
bun install

# 启动开发服务器（默认 :3000）
bun run dev

# 类型检查
bun run lint

# 生产构建（产出含 sw.js 与 manifest 的 PWA 产物）
bun run build

# GitHub Pages 项目站构建（子路径部署）
PAGES_BASE=/moyugang/ bun run build
```

## 部署（GitHub Pages）

推送至 main 即触发 `.github/workflows/deploy-pages.yml`：以 `PAGES_BASE=/moyugang/` 构建 PWA 产物并经 GitHub Pages 发布，无需手工操作。首次启用需在仓库 Settings → Pages 将 Source 设为 **GitHub Actions**。

## 技术栈

React 19 · Vite 8 · TypeScript 5 · Tailwind CSS 4 · Canvas 2D · vite-plugin-pwa（Workbox 预缓存）· GitHub Actions

## 目录结构

```
src/
  components/   # 界面组件（战斗、章节选择、祝福、成就、PWA 更新提示等）
  utils/        # 渲染器、动画系统、手势/字诀识别、矢量武器系统、音频
  data/         # 关卡、技能与游戏数据
  assets/       # 字体与美术资源
scripts/        # 图标生成、字体子集化、识别器标定、冒烟测试等开发脚本
public/         # PWA 图标与静态资源
```
