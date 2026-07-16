# Rig

Rig 是面向 Agent 的 macOS CLI，用于基于 Git 的多仓库开发、本地 LLM Wiki、
文件化 Agent 编排，以及 Claude Code → Codex 会话接管。

[English](./README.md)

## 安装

需要 macOS 与 Node.js 22–26。

```bash
npx --yes rigjs@latest setup
```

这一条命令会把用户级 `rig` CLI 持久安装到 `~/.rig`、加入新 zsh 会话的
`PATH`，并把 Rig Skill 安装到检测到的 Codex 和 Claude Code。首次安装后
打开新终端并新建 Agent 会话，即可使用。

## Agent Skills

Rig 共提供 7 个 Agent Skill。其中 6 个可由开放 Agent Skills CLI 发现；
`rig-crew` 随包提供，并由 Rig 与 `rig-wiki` 成对安装。

| Skill | 教给 Agent 的能力 | 适用 Agent | 安装方式 |
|---|---|---|---|
| `rig` | 判断并操作正确的 Rig 命令族 | Codex、Claude Code | `rigjs setup` 或 `skills add` |
| `rig-wiki` | 摄入、检索、检查和重建本地 LLM Wiki | Codex、Claude Code | `skills add` 或 Wiki 安装器 |
| `rig-crew` | 协调基于文件的多 Agent 工作 | 全局 Claude；项目内 Codex/Claude | Wiki 安装器 |
| `rig-package` | 管理 Git tag 依赖与本地联调 | Codex、Claude Code | `skills add` |
| `rig-cicd` | 构建并发布静态站点到阿里云 OSS/CDN | Codex、Claude Code | `skills add` |
| `handoff` | 把 Claude `/handoff` 转换成不调用模型的剪贴板接管 | Claude Code | Handoff 安装器 |
| `rig-from-claude` | 恢复本地 Claude JSONL 并继续任务 | Codex | Handoff 安装器 |

查看标准 CLI 能发现的 Skill：

```bash
npx --yes skills add FlashHand/rig --list
```

全局安装一个独立 Skill：

```bash
npx --yes skills add FlashHand/rig \
  --skill rig-package \
  -g -a codex -a claude-code -y
```

一次安装多个独立 Skill：

```bash
npx --yes skills add FlashHand/rig \
  --skill rig \
  --skill rig-wiki \
  --skill rig-package \
  --skill rig-cicd \
  -g -a codex -a claude-code -y
```

如果需要同时使用 `rig-wiki` 和 `rig-crew`，不要单独安装 `rig-wiki`，改用
Rig 的成对安装器：

```bash
rig wiki install-skill             # 用户级 Claude Code
rig wiki install-skill --project   # 当前项目：Codex + Claude Code
```

Handoff 的两个 Skill 也是托管组合，因为除了 Skill 目录，它还需要 Claude
Hook 与稳定 launcher：

```bash
rig handoff install
rig handoff doctor
```

不要只用 `skills add` 安装 `handoff` 或 `rig-from-claude`；那样不会配置完整
接管所需的 Hook 和 launcher。

## 让 Agent 学会使用 Rig

把内置操作指南复制到剪贴板，再粘贴给 Claude Code、Codex 或其他 Coding
Agent 即可：

```bash
rig guide --copy
```

Guide 是写给 Agent 的，人不需要阅读或记住完整命令。也可以用 `rig guide`
直接输出；`rig man` 是同一命令的别名。仓库版本见
[`RIG_GUIDE.md`](./RIG_GUIDE.md)。

### 把 Claude 的工作交给 Codex 继续

执行 `rig handoff install` 后，在 Claude Code 中输入 `/handoff`，再把自动
复制的 handoff 粘贴到 Codex。Codex 的 `$rig-from-claude` Skill 会从本地
JSONL 的最新有效内容开始读取，恢复目标、决策、文件修改、工具结果、错误和
未完成工作；核对当前工作区真实状态后直接继续任务。Claude 因 token、额度、
计费、认证或输出上限停止时，`StopFailure` Hook 也能直接生成 handoff，无需
再让 Claude 总结。

如果 Claude 已经无法交互，可在终端运行 `rig handoff copy --latest`，再把结果
粘贴到 Codex。

## 最简单的几个命令

```bash
rig help                 # 命令索引
rig guide                # 完整 Agent Guide
rig setup                # 安装/更新 CLI 与 Rig Skill
rig init                 # 在项目中初始化 Git 依赖管理
rig dev <dependency>     # 本地开发一个依赖
rig handoff install      # 安装 Claude Code → Codex handoff
rig handoff doctor       # 检查 Hook、launcher 与两个 Skill
```

查看细节时使用 `rig help <command>` 或
`rig <command> <subcommand> --help`。

License: MIT
