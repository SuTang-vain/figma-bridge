# figma-bridge

**面向 AI agent 的 Figma 设计数据 CLI——无需 MCP，无需桌面客户端。**

[English](./README.md) | 中文

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/figma-bridge-cli)](https://www.npmjs.com/package/figma-bridge-cli)
[![GitHub stars](https://img.shields.io/github/stars/SuTang-vain/figma-bridge?style=flat)](https://github.com/SuTang-vain/figma-bridge/stargazers)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)

`figma-bridge` 把 Figma REST API 转换成紧凑、对 agent 友好的文本，复用
[Framelink](https://github.com/GLips/Figma-Context-MCP) 的简化管线（作为库引入）。
为只能用 shell 的 agent（pi、自定义脚本、CI，以及任何不支持 MCP 的 agent）而生，
也适合被 MCP 的 token 膨胀、套餐限流、桌面端依赖困扰的开发者。

![figma-bridge 演示：screens → node → 批量模式](./assets/demo.gif)

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

从源码安装：

```bash
git clone https://github.com/SuTang-vain/figma-bridge ~/figma-bridge
cd ~/figma-bridge && npm install
mkdir -p ~/.local/bin && ln -s ~/figma-bridge/bin/figma-bridge.js ~/.local/bin/figma-bridge
```

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
及复现方法见 [BENCHMARKS.md](./BENCHMARKS.md)。

## 用法

```bash
# 渐进式：先列画板（输出很小），再按需取节点
figma-bridge screens <fileKey>
figma-bridge node <fileKey> <nodeId> --depth 1 --fields layout+text
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
- 面向 agent 的文档：[SKILL.md](./SKILL.md)

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

[MIT](./LICENSE)
