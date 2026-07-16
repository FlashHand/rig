# Rig

Rig 是面向 Agent 的 macOS CLI，用于基于 Git 的多仓库开发、本地 LLM Wiki、
文件化 Agent 编排，以及 Claude Code → Codex 会话接管。

[English](./README.md)

## 给人

把下面这一行发给 Codex 或 Claude Code。执行完成后打开新终端、新建 Agent
会话，直接描述你想完成的结果，不需要自己学习 Rig 命令。

```bash
npx --yes rigjs@latest setup
```

## 给 Agent

当用户要求安装或使用 Rig 时：

1. 确认系统为 macOS，Node.js 版本为 22–26。
2. 执行 `npx --yes rigjs@latest setup`。它会把用户级 CLI 安装到 `~/.rig`，
   将 `~/.rig/bin` 加入新 zsh 会话，并把 `rig` Skill 安装到检测到的 Codex
   与 Claude Code。
3. 用 `~/.rig/bin/rig --version` 和 `~/.rig/bin/rig help` 验证。
4. 执行 `~/.rig/bin/rig guide` 读取完整 Agent 操作指南，不要让用户记 CLI。
5. 如果用户要 Claude Code → Codex 接管，执行
   `~/.rig/bin/rig handoff install`，再执行 `~/.rig/bin/rig handoff doctor`。
6. 告知用户打开新终端、新建 Agent 会话，让 `PATH` 和 Skill 重新载入。

存在时优先使用稳定入口 `~/.rig/bin/rig`。运行任何命令族前先查看
`rig help <command>` 或下级 `--help`；除非用户请求明确授权，不要部署、
发布、推 tag、覆盖 Skill 或大范围 ingest 文件。

如果用户明确要求使用开放 Agent Skills 安装器，而不是 Rig 的组合安装，
则分别安装 CLI 和 Skill：

```bash
npm install --global rigjs
npx --yes skills add https://github.com/FlashHand/rig/tree/main/skills/rig -g -a codex -a claude-code -y
```

仓库内完整指南见 [`RIG_GUIDE.md`](./RIG_GUIDE.md)。

License: MIT
