# Rig

Rig 是面向 Agent 的 macOS CLI，用于基于 Git 的多仓库开发、本地 LLM Wiki、
文件化 Agent 编排，以及 Claude Code → Codex 会话接管。

[English](./README.md)

## 安装

需要 macOS 与 Node.js 22–26。

```bash
npm install --global rigjs
rig --version
```

## 让 Agent 学会使用 Rig

把内置操作指南复制到剪贴板，再粘贴给 Claude Code、Codex 或其他 Coding
Agent 即可：

```bash
rig guide --copy
```

Guide 是写给 Agent 的，人不需要阅读或记住完整命令。也可以用 `rig guide`
直接输出；`rig man` 是同一命令的别名。仓库版本见
[`RIG_GUIDE.md`](./RIG_GUIDE.md)。

## 最简单的几个命令

```bash
rig help                 # 命令索引
rig guide                # 完整 Agent Guide
rig init                 # 在项目中初始化 Git 依赖管理
rig dev <dependency>     # 本地开发一个依赖
rig handoff install      # 安装 Claude Code → Codex handoff
```

查看细节时使用 `rig help <command>` 或
`rig <command> <subcommand> --help`。

License: MIT
