# rig

- [dependencies配置](./doc/dependencies_cn.md)

## 这个包里有什么

- **多仓库 workspace 工具**(原始能力):`rig init / add / dev / install / build / deploy / publish / sync / tag`,详见下面 [快速开始](#快速开始)。
- **`rig wiki *`** —— Karpathy 风格的 LLM Wiki 操作集合(scan / fetch / ingest / query / lint),配套 launchd daemon 做定时任务。底层用 Claude Code 当执行器。macOS only,Node ≥ 22。详见 [`RIG_WIKI_SKILL.md`](./RIG_WIKI_SKILL.md) 和 [`doc/architecture/wiki.md`](./doc/architecture/wiki.md)。
- **`rig crew *`** —— 基于文件状态的 Leader-first 多 Agent 协作,面向 Obsidian Vault,支持 Project Owner、人类看板、Inbox、Claude Code / Codex 混合 executor。详见 [`RIG_CREW_SKILL.md`](./RIG_CREW_SKILL.md)。
- **内置 Claude Code skill**(`rig-wiki`)—— 通过 [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json) 注册为 Claude Code plugin。`rig-crew` 属于 Vault 级协作规则,不再维护项目内 plugin 副本。Skill 总览见 [`skills.md`](./skills.md)。

## 安装内置 skills(三条路任选)

最终结果都一样:Claude Code 在 `~/.claude/skills/` 下看到内置 skills。

1. **`npm i -g rigjs`** —— 包的 `postinstall` 脚本自动 symlink 到 `~/.claude/skills/`,装完即用,**重启 Claude Code** 生效。
2. **`npm i -g rigjs --ignore-scripts`**(安全敏感用户)—— postinstall 被跳过,再手动跑一次 `rig wiki install-skill` 即可。
3. **Claude Code 官方 plugin marketplace** —— 别人(或你自己)把一份 `marketplace.json` 指向 `{ "source": "npm", "package": "rigjs" }`,然后用户走 `/plugin install rig-wiki@<marketplace>` —— 整条链路由 Claude Code 自己管,postinstall 不会跑。

路径 1 的 opt-out:`RIG_NO_AUTO_SKILL=1 npm i -g rigjs`。卸载 skill:`rig wiki uninstall-skill`。

## 快速开始

### 0.前提准备

1. 安装yarn.
2. node版本高于16.
3. 依赖库必须使用git+ssh链接,不支持http/https链接.
4. 以下rig库统一指代在可以用rig管理的仓库.

#### 安装yarn,

```shell
yarn global add rigjs
```

rig采用yarn workspaces实现依赖晋升。[关于yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces)

#### NodeJS版本不低于16

使用 [n](https://github.com/tj/n) 更新NodeJS

```shell
yarn global add n
#更新到lts
sudo n lts 
#或指定版本
sudo n 16.19.1
```

### 1.在项目中初始化rig配置。

```shell script
#在你的项目根目录中（和package.json同级）执行：
rig init
```

package.rig.json5 会被添加到工程根目录。

通过yarn add新的依赖时需要增加-W参数,如:

```shell
yarn add axios -W
```

### 2.使用rig安装现有的代码库

修改package.rig.json5:

version是git的tag

如下:

```json5
{
  dependencies: {
    'rig-demo-1': {
      source: 'git@github.com:FlashHand/rig-demo-1.git',
      version: '0.0.1',
    }
  }
}
```

然后执行

```shell
yarn install
```

### 3. 前端开发工具配置

#### 3.1 vite

尽量使用最新的vite,在vite.config.ts中增加代码

```typescript
import {viteCommonjs} from '@originjs/vite-plugin-commonjs';
import commonjs from '@rollup/plugin-commonjs';
import rigHelper from "rig-helper";

export default defineConfig((env: ConfigEnv) => {
	//.....
	return {
		plugins: [//...
			viteCommonjs({include: rig_helper.getPkgs()}),//commonjs to esm,serve时有效,
			commonjs({include: rig_helper.getPkgs()}),//commonjs to esm,build时有效
			//... 
		],
        optimizeDeps: {
            exclude: rig_helper.getPkgs(),//vite小于4时,
        },
		server: {
			watch: {
				ignored: rig_helper.getRigGlobs(),//vite小于4时,监听rig_dev下的目录文件发生变化,触发hmr
				followSymlinks: true,//followSymlinks不能为false
			},
		}
	}
})
```

#### 3.2 webpack


#### 3.3 vue-cli

### 4.开发一个新的rig库或改造现有仓库为rig库

rig库指在rig管理下的仓库

参考demo目录

## 关于RigJS模块化开发功能的特点:

1. RigJS功能基于yarn和git开发,无需私有npm.
2. 及时的将代码库分享给任何JS项目使用.
3. 支持快捷的rig库开发模式,支持自动npm link,可以在业务开发过程中调试rig库.
4. 易扩展,专注于代码库集成组装和协作,不负责transpile,和JS项目框架无关.

## 其他功能

| 功能                 | 状态    |
|:-------------------|:------|
| 环境变量集成(减少环境变量文件数量) | 待编写文档 |
| 静态资源分享             | 待编写文档 |
| 基于OSS+CDN的ci/cd    | 待编写文档 |
| Electron多进程协作开发    | 开发中   |
| 微前端协作开发            | 开发中   |

## 命令清单

### rig init

初始化rig管理工具,在项目根目录执行.

### rig --env [mode]

从env.rig.json5中指定一组环境变量,并覆盖到.env.rig文件中

### rig tag

在git仓库nothing to commit后执行,可以将package.json中的版本打为tag
