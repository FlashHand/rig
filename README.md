# rig
*[中文文档](./README_CN.md)*

## What's in this package

- **Multi-repo workspace tooling** (the original purpose): `rig init / add / dev / install / build / deploy / publish / sync / tag`. See [Get started](#get-started) below.
- **`rig wiki *`** — Karpathy-style LLM Wiki ops (scan / fetch / ingest / query / lint), with a launchd daemon for periodic runs. Backed by Claude Code as the executor. macOS only, Node ≥ 22. See [`RIG_WIKI_SKILL.md`](./RIG_WIKI_SKILL.md) and [`doc/architecture/wiki.md`](./doc/architecture/wiki.md).
- **`rig crew *`** — file-backed, Leader-first multi-agent coordination over an Obsidian vault. Supports project owners, a human dashboard, inbox, and mixed executors such as Claude Code and Codex. See [`RIG_CREW_SKILL.md`](./RIG_CREW_SKILL.md).
- **Bundled Claude Code skill** — `rig-wiki`, registered as a Claude Code plugin via [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json). `rig-crew` is Vault-level guidance rather than a project-local plugin copy. See the skill index: [`skills.md`](./skills.md).

## Installing bundled skills (three paths)

Pick one — they all end with Claude Code seeing bundled skills under `~/.claude/skills/`.

1. **`npm i -g rigjs`** — the package's `postinstall` script symlinks bundled skills into `~/.claude/skills/` automatically. No further action.
2. **`npm i -g rigjs --ignore-scripts`** (security-conscious users) — postinstall is skipped, so finish with `rig wiki install-skill`.
3. **Claude Code plugin marketplace** — once you (or anyone) host a `marketplace.json` pointing at `{ "source": "npm", "package": "rigjs" }`, users install via `/plugin install rig-wiki@<marketplace>` — Claude Code handles everything; postinstall does not run.

Opt-out for path 1: `RIG_NO_AUTO_SKILL=1 npm i -g rigjs`. To remove: `rig wiki uninstall-skill`.

## Get started
### 0.Prerequisites
#### Install yarn
```shell
yarn global add rigjs
```
Rigjs use yarn workspaces to achieve module-hoisting. [About yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces).
#### NodeJS version >= 14
Use [n](https://github.com/tj/n) to update NodeJS.
```shell
yarn global add n
#upgrade to lts
sudo n lts 
#or specify the version.
sudo n 14.19.1
```

### 1.Initialize rigjs configuration。

```shell script
#in your project's root path（same level with package.json）：
rig init
```
package.rig.json5 will be added in root path.

### 2.Use rigjs to install existing repos.
#### 2.1 Method-one：rig add
rig add [your-git-ssh-url] [tag]

example:
```shell
rig add git@github.com:FlashHand/rig-demo-1.git 0.0.1
```
import or require the module.
```ecmascript 6
const {hello} = require('rig-demo-1');
hello();
```

#### 2.2 Method-two：change package.rig.json5
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
then
```shell
yarn install
```
### 3.Use rigjs to develop an existing repo.
#### 3.1 Method-one：rig dev
rig dev [package's name|git-ssh-url]

When package is already in package.rig.json5:
```shell
rig dev rig-demo-1
```
When package is not in package.rig.json5:
```shell
rig dev git@github.com:FlashHand/rig-demo-1.git
```

**rig-demo-1** will be installed in rig_dev directory.And a symlink of the module will be created in node_modules.
#### 3.1 Method-two：change package.rig.json5
```json5
{
  dependencies: {
    'rig-demo-1': {
      source: 'git@github.com:FlashHand/rig-demo-1.git',
      version: '0.0.1',
      dev: true //false by default
    }
  }
}
```
then
```shell
yarn install
```

### 4.Create and develop a new rigjs module。
#### 4.1 Create a git repo。
get git-ssh url: git@github.com:FlashHand/rig-demo-1.git
#### 4.2 Start developing your modules in rigjs dependencies
rig dev git@github.com:FlashHand/rig-demo-1.git
#### 4.3 Initialize your module
```shell
cd your_project_path
cd rig_dev/rig-demo-1
yarn init 
echo "module.export={hello:()=>{console.log('hello')}}" > index.js
```
#### 4.4 Use rigjs modules in your main project。
```ecmascript 6
const {hello} = require('rig-demo-1');
hello();
```
#### 4.5 Use rigjs module in production。
publish tag
```shell
cd rig_dev/rig-demo-1
git add .
git commit -m 'demo for rig'
git tag 0.0.1
git push origin your_branch --tag
```
Modify package.rig.json5
- Change the module's version
- Set dev to false.Don't use dev mode in production and should specify the version you need.
```json5
{
  dependencies: {
    'rig-demo-1': {
      source: 'git@github.com:FlashHand/rig-demo-1.git',
      version: '0.0.1',
//      dev:true//Don't use dev mode in production.
    }
  }
}
```
### In Electron Project

### In Vite Project

## Advantages
- 💡Rigjs only needs git.No need to publish packages to private registry.
- ⚡️Instant code sharing between multiple projects and multiple developers.Packages can be easily installed by git-ssh-url and tag.
- ⚙️Auto npm link in dev mode.Import or require packages just like normal node_modules with friendly code suggestion.
- 🔍Easily develop packages within your projects.Packages in *dev* mode are all in *rig_dev* folder.
- 💨Easily transform existing code into a sharable package for multiple projects.
-  📏Large content scale.You can share from a simple js file to multiple files that contains many pages.
- 🧹Flat dependencies.No need to worry complex packages' relationship.

## Goals
### Sharing codes or files.
1. Reuse codes between different developers or different projects in most flexible and unobtrusive way.
2. Easily turn modules into developing mode,no need to use npm link or change package.json.
3. Also support sharing files between projects like '.eslintrc.js' or 'tsconfig.json'...
4. Developing one website in multiple modules.

### Serverless CI/CD
1. Build multiple versions for different environments at same time.
2. Support deploying and publishing(Only support ali-cloud's oss and cdn by now).

### Remote modules' helper(in development)
- Working with webpack5's module federation.
- Easily active modules' developing mode.
- Friendly Code suggestion.
- Simple router that can brings you everywhere.
- Sandbox,state sharing....

### Current Limits
- Rigjs packages can share source code directly in node_modules.So transpiling or compiling might be needed.
- Rigjs can not remove redundant codes for remote modules.
- Although rigjs supports developing one website in multiple repos,
  But they all need to be built together into one application package.
  So it wastes time to build those unchanged modules ,which seems wrong when your website has hundreds or thousands of pages.
- CI/CD only supports ali-cloud's oss and cdn.I don't have plans to make it better for now.

I'm still developing new features in most flexible and unobtrusive way.So my team won't cost extra time to upgrade their applications' architecture.

Rigjs works great for my team in development of vue-apps,uni-apps,electron apps and nodejs apps.If you don't need many remote modules,it will work fine for you too.
