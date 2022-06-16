# rig
- [快速开始](#快速开始：基于rig的模块化开发)
- [工作机制](#工作机制)

##What is rig?
- Rig is created to be a handy tool for sharing any packages and files cross projects.
- Rig is a multi-repos modular developing tool.Kind of like **Carthage**(Carthage is a dependency manager for Apple Cocoa application).
- Rig is also created to deliver ci/cd capabilities.

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

## Advatages
- 💡Rig only needs git.No need to publish packages to public or private npm.
- ⚡️Instant source code sharing for multiple projects and multiple developers.Packages can be easily installed by git-ssh-url and tag.
- ⚙️Auto npm link.Import or require packages just like normal node_modules.
- 😆Easy to develop packages under rig.Packages in *dev* mode are all in *rig_dev* folder.
- 💨Easily transforming existing unsharable code into a sharable package for multiple projects.
-  📏Large content scale.You can share from a simple js file to multiple files that contains many pages、components.
- 🧹Flat dependencies.No need to worry complex packages' relationship.
## Limit
- Rig packages can sharing source code.So transpiling or compiling may be needed.
## Differences with npm
## Differences with lerna
