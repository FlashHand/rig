# rig
- [目标](#目标)
- [快速开始](#快速开始：基于rig的模块化开发)
- [dependencies配置](./doc/dependencies_cn.md)
- [CICD配置](./doc/cicd_cn.md)
- [share 文件共享](./doc/share_cn.md)

## 快速开始：基于rig的模块化开发
### 0.前提准备
#### 安装yarn,
```shell
yarn global add rigjs
```
rig采用yarn workspaces实现依赖晋升。[关于yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces)
#### NodeJS版本不低于14
使用 [n](https://github.com/tj/n) 更新NodeJS
```shell
yarn global add n
#更新到lts
sudo n lts 
#或指定版本
sudo n 14.19.1
```

### 1.在项目中初始化rig配置。

```shell script
#在你的项目根目录中（和package.json同级）执行：
rig init
```
package.rig.json5 会被添加到工程根目录。

### 2.使用rig安装现有的代码库
#### 2.1 方法一：rig add
rig add [your git ssh url] [tag]
e.g.
```shell
rig add git@github.com:FlashHand/rig-demo-1.git 0.0.1
```
引用该仓库
```ecmascript 6
const {hello} = require('rig-demo-1');
hello();
```

#### 2.2 方法二：在package.rig.json5中修改配置
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
### 3.在rig管理下，开发一个现有的代码库
#### 3.1 方法一：rig dev
rig dev [包名称|git-ssh-url]
当package已经存在于package.rig.json5
```shell
rig dev rig-demo-1
```
当package还不存在于package.rig.json5.
```shell
#安装代码包并设为开发模式
rig dev rig-demo-1 git@github.com:FlashHand/rig-demo-1.git
```

rig-demo-1会被安装到rig_dev目录下。node_modules会存在rig-demo-1的symlink.
#### 3.1 方法二：在package.rig.json5中修改配置
```json5
{
  dependencies: {
    'rig-demo-1': {
      source: 'git@github.com:FlashHand/rig-demo-1.git',
      version: '0.0.1',
      dev: true //默认是false,
    }
  }
}
```
然后执行
```shell
yarn install
```

### 4.制作和开发新的rig代码库。
#### 4.1 创建一个git仓库。
获取git ssh url例如： git@github.com:FlashHand/rig-demo-1.git
#### 4.2 在rig依赖中添加你的仓库
rig dev git@github.com:FlashHand/rig-demo-1.git
#### 4.3 开发你的rig库
```shell
cd your_project_path
cd rigs_dev/rig-demo-1
#如果项目没有初始化，执行初始化，并创建index
yarn init 
echo "module.export={hello:()=>{console.log('hello')}}" > index.js
```
#### 4.4 在项目中使用rig仓库。
```ecmascript 6
const {hello} = require('rig-demo-1');
hello();
```
#### 4.5 在生产环境中使用rig仓库。
发布rig仓库的tag
```shell
cd rigs_dev/rig-demo-1
git add .
git commit -m 'demo for rig'
git tag 0.0.1
git push origin your_branch --tag
```
在package.rig.json5中修改配置
- 修改version
- 设dev为false,生产环境中不要使用dev模式，应该指定安装确定的version.
```json5
{
  dependencies: {
    'rig-demo-1': {
      source: 'git@github.com:FlashHand/rig-demo-1.git',
      version: '0.0.1',
      //      dev:true//生产环境中不要使用dev模式，应该指定安装确定的version.
    }
  }
}
```

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
