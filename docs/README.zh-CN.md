# figma-bridge

**面向 AI agent 的 Figma 设计数据：既是给 shell-only agent 的 CLI，也是 [pi 包](https://pi.dev/packages/figma-bridge-cli)（一个紧凑工具）——无需 MCP，无需桌面客户端。**

[English](../README.md) | 中文

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![npm](https://img.shields.io/npm/v/figma-bridge-cli)](https://www.npmjs.com/package/figma-bridge-cli)
[![pi-package](https://img.shields.io/badge/pi--package-listed-blue)](https://pi.dev/packages/figma-bridge-cli)
[![GitHub release](https://img.shields.io/github/v/release/SuTang-vain/figma-bridge)](https://github.com/SuTang-vain/figma-bridge/releases)
[![GitHub stars](https://img.shields.io/github/stars/SuTang-vain/figma-bridge?style=flat)](https://github.com/SuTang-vain/figma-bridge/stargazers)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)

`figma-bridge` 把 Figma REST API 转换成紧凑、对 agent 友好的文本，复用
[Framelink](https://github.com/GLips/Figma-Context-MCP) 的简化管线（作为库引入）。
为只能用 shell 的 agent（pi、自定义脚本、CI，以及任何不支持 MCP 的 agent）而生，
也适合被 MCP 的 token 膨胀、套餐限流、桌面端依赖困扰的开发者。

![figma-bridge 演示：screens → node → 批量模式](../assets/demo.gif)

## 为什么不用 MCP？

- **没有上下文税**——MCP 的工具 schema 会常驻对话上下文；CLI 只需要几行用法说明
- **没有活动部件**——无服务进程生命周期、无桌面客户端、无 OAuth 跳转；每次调用一个进程，冷启动约 1 秒
- **渐进式披露**——`screens` → `node` → `images`，而不是整文件倾倒；字段预设和深度控制让输出保持小巧
- **缓存感知**——文件 `lastModified` 未变时复用响应，节省 API 配额

## 安装

```bash
npm i -g figma-bridge-cli

# 认证：Figma → Settings → Security → Personal access tokens
mkdir -p ~/.config/figma && chmod 700 ~/.config/figma
printf '你的TOKEN' > ~/.config/figma/api-key && chmod 600 ~/.config/figma/api-key
```

需要 Node 18+。上游 `figma-developer-mcp` 库声明 `engines: >=20.20.0`；本项目用到的代码路径已在 CI 的 18.20 上验证，
因此 18 实际可用——但若你的包管理器严格校验 engines，或想遵循上游的最低版本，建议用 Node 20.20 以上。

从源码安装：

```bash
git clone https://github.com/SuTang-vain/figma-bridge ~/figma-bridge
cd ~/figma-bridge && npm install
mkdir -p ~/.local/bin && ln -s ~/figma-bridge/bin/figma-bridge.js ~/.local/bin/figma-bridge
```

## 在 pi 里使用

```bash
pi install npm:figma-bridge-cli     # 注册一个 `figma` 工具 + figma-bridge 技能
```

一个工具覆盖全流程——先看概览，再按需取用：

```jsonc
figma({ mode: "screens", ref: "https://www.figma.com/design/<fileKey>/<name>" })   // 页面+画板概览，输出很小
figma({ mode: "node",    ref: "<fileKey>", nodeId: "1:4", depth: 1, fields: "layout+text" })
figma({ mode: "changed", ref: "<fileKey>" })                                       // 与上次调用的差异
figma({ mode: "variables", ref: "<fileKey>" })                                     // 设计令牌 → CSS 变量（需 Enterprise）
figma({ mode: "images",  ref: "<fileKey>", nodeIds: ["1:4"], outDir: "assets" })
```

同一个包仍然是普通 CLI：`npm i -g figma-bridge-cli` 供任何 shell-only agent 使用，不依赖 pi。在 pi 里扩展只暴露
**一个** `figma` 工具（用 `mode` 枚举区分 `screens | node | changed | images | variables`），而不是每个操作一个工具——工具 schema 是
每轮都要付的上下文税。

`figma-developer-mcp` 依赖仅作为库使用（Framelink 的简化管线），不启动任何 MCP 服务或传输层。

## 与同类包的关系

另外两个 pi 包覆盖相邻领域，且都做得不错：[`@pi-stef/figma`](https://www.npmjs.com/package/@pi-stef/figma)（20 个 REST 工具，自有配置文件）与
[`@bigmints.com/pi-figma-bridge`](https://www.npmjs.com/package/@bigmints.com/pi-figma-bridge)（7 个工具，桥接 Figma 桌面插件）。
紧凑输出、缓存、超长输出落盘、图片导出**并非**本项目独有——它们也有，桌面插件路线还额外支持带 dry-run 的写入。

本项目补的是：**面向所有 agent**（CLI 不限于 pi）、把使用指引以**技能**形式随包发布，以及**公开可复现**的性能数据
（[BENCHMARKS.md](../BENCHMARKS.md) + `./bench.sh`，含每轮原始输出）。

## 成本、隐私与边界

- **零遥测。**网络流量只有你要的 Figma API 请求——无使用统计、无错误上报；设计文件标识不会经由本工具外泄。
- **成本确定。**没有按量计费。Figma 官方文档写明其 MCP 服务“测试期免费”，[之后将转为按量付费](https://help.figma.com/hc/en-us/articles/32132100833559)；
  figma-bridge 只消耗你套餐自带的 REST 限流额度，缓存还能进一步省。
- **天然无头。**任何能跑 Node 18+ 的地方都能跑——CI、服务器、容器，无需桌面应用。
- **token 纪律。**上下文才是最稀缺的资源，随包技能强制“先粗后细”的工作流；Figma 自家文档都记录了单次
  `get_design_context` 响应 [~351k token](https://developers.figma.com/docs/figma-mcp-server/mcp-clients-issue)
  撑爆客户端上限——那正是本工具要避免的失败模式。

明确不做的边界：

- **写回 Figma 文件**——REST API 只读；除非 Figma 开放写端点，否则永远不做。
- **Code Connect / 官方 codegen / FigJam / 动效数据**——Dev Mode 专属能力，公共 REST API 无对等端点；这些请用 Figma 官方 MCP。
- **无 Enterprise 套餐的 variables**——`/variables/local` 由 Figma 按套餐门控；该模式会给出明确解释而不是晦涩报错。

## 实际效果

```bash
$ figma-bridge screens ymWuCHHNU22zse8nVTVmNN
NAME: "Food delivery app Ui kit (Community)"
LAST_MODIFIED: 2026-09-10T15:39:49Z

[PAGE] "📺  Mobile Screens" #0:1
  [FRAME] "iPhone 11 Pro Max - 1" #1:4 414x896
  [FRAME] "iPhone 11 Pro Max - 2" #2:1 414x896
  ...

$ figma-bridge node ymWuCHHNU22zse8nVTVmNN 1:4 --depth 1 --fields layout+text
[TEXT] "Food for Everyone" #7:9 layout={...} textStyle={fontFamily:"SF Pro Rounded",fontWeight:800,fontSize:65,...} text="Food for \nEveryone"
```

同一节点、同一深度：figma-bridge 约 1.8 KB，MCP 桥接约 3 KB——而 `screens`
大纲相比整文件拉取几乎零成本。多轮实测数据（延迟、输出体积、缓存行为、批量模式）
及复现方法见 [BENCHMARKS.md](../BENCHMARKS.md)。

## 用法

```bash
# 渐进式：先列画板（输出很小），再按需取节点
figma-bridge screens <fileKey>
figma-bridge changed <fileKey>          # 与上次 changed 调用相比的变动（按深度存快照）
figma-bridge node <fileKey> <nodeId> --depth 1 --fields layout+text
figma-bridge variables <fileKey>        # 设计令牌 → CSS custom properties（需 Enterprise 套餐）
figma-bridge images <fileKey> <id1,id2> -o ./assets --format png --scale 2

# 多步操作用批量模式（预置 helpers，支持顶层 await）
figma-bridge nodejs <<'EOF'
cliLog(await getScreens('FILE_KEY'))
cliLog(await getNode('FILE_KEY', '1:4', { depth: 2, fields: 'layout+text' }))
EOF
```

- 所有子命令直接接受完整 Figma 链接，无需手动提取 fileKey/nodeId：
  `figma-bridge node 'https://www.figma.com/design/<key>/Name?node-id=1-4'`
- `--fields` 预设：`all`（默认）、`layout+text`、`content`、`visuals`、`layout`
- 响应按文件缓存，`lastModified` 未变时复用
- 面向 agent 的文档：[skills/figma-bridge/SKILL.md](../skills/figma-bridge/SKILL.md)

## 工作原理

```
agent → figma-bridge（CLI）→ Figma REST API → Framelink 简化管线（作为库）
```

没有 MCP 传输层。Framelink 的 extractor 把冗长的 Figma JSON 转成紧凑树，去重样式
归入 `GLOBAL_VARS`；figma-bridge 在其上增加了渐进式子命令、字段预设、缓存和批量
脚本模式。

## 路线图

- [ ] 离线 `.fig` 文件解析（不依赖 API，不受限流影响）
- [ ] 可插拔的 Figma 之外的数据源（仅在真实需求出现时）
- [ ] `figma-bridge serve` 常驻 daemon，极致低延迟

## 许可证

[MIT](../LICENSE)
