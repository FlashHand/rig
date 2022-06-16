# rig

- [快速开始](#快速开始)
- [工作机制](#工作机制)
- 命令
  - [`rig init`](#rig-init)
  - [`rig install`](#rig-install)
  - [`rig check`](#rig-check)
  - [`rig tag`](#rig-tag)
##Installation
```shell
npm i -g yarn
yarn global add rigjs
```

##What is rig?
- Rig is created to be a handy tool for sharing any packages and files cross projects.
- Rig is a multi-repos modular developing tool.Kind of like **Carthage**(Carthage is a dependency manager for Apple Cocoa application).
- Rig is also created to deliver ci/cd capabilities.
  
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

## 快速开始：基于rig的模块化开发
### 0.前提准备
#### 0.1安装yarn,
rig采用yarn workspaces实现依赖晋升 。

[关于yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces)
#### 0.2 NodeJS版本不低于14
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
yarn global add rigjs
#在你的项目根目录中（和package.json同级）执行：
rig init
```
package.rig.json5 会被添加到工程根目录。

### 2.使用现有的代码库
#### 2.1 方法一：rig add
1. 确定你要使用的代码库和tag name.
2. rig add [your git ssh url] [tag]

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
### 3.开发一个现有的rig代码库

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





### 


**2.配置 package.rig.json5**
```json5
[
  {
    name: 'r-b',
    source: 'git@github.com:FlashHand/rig-test-1.git',
    version: '1.0.0',
  },
  {
    name: 'r-c',
    source: 'git@github.com:FlashHand/rig-test-2.git',
    version: '1.0.0',
    //dev默认为false
    dev: true
  }
]
```
version等于tag

**3.run install:**
```shell script
rig install
```
OR
```shell script
yarn install
```
**Results:**

r-b 会被安装到node_modules中

r-c 会被安装到rigs/下，同时在node_modules中创建一个对它的软链接。

"rig install" 等价于 "yarn install".
因为所有的功能都是在preinstall和postinstall中实现。

## 工作机制

#### package.rig.json5

ig由cocoaprods启发。
不像那些流行的monorepo的解决方案。Rig是一个多库开发的集成工具。

所以rig会创建一个package.rig.json5文件。
package.rig.json5里的数据看起来如下：
```json5
//dev 默认为false
[
//  {
//    name: 'r-a',//module's name
//    source: 'git@git.domain.com:common/r-a.git',//module's source
//    version: '1.0.0',//Notice:this used as tag.module's version ,
//  },
  {
    name: 'r-b',
    source: 'git@git.domain.com:common/r-b.git',
    version: '1.0.0',
  },
  {
    name: 'r-c',
    source: 'git@git.domain.com:common/r-c.git',
    version: '1.0.0',
    dev: true
  }
]
```
package.rig.json5拥有一组模块，每个模块都可以给自己定义单独的源。

rig 会创建一个叫rigs的文件夹

当dev为true时文件的主干会被clone到rigs下

而且代码库会被自动链接到node_modules中。

#### rig如何修改package.rig.json5

```javascript
//rig会向package.json中注入这些内容
//rig 不会覆盖你的preinstall和postinstall的脚本。workspaces的配置也是补充进去的，不回去覆盖。
let inserted = {
      private: true,
      workspaces: [
        "rigs/*",
        "rigs_dev/*"
      ],
      scripts:{
        preinstall:"rig preinstall",
        postinstall:"rig postinstall",
      }
    }
```
rig机制概括起来就是分库开发，整体构建。
![develop](https://github.com/FlashHand/rig/raw/main/develop.png)
![production](https://github.com/FlashHand/rig/raw/main/production.png)
#### 主要功能

1. 更方便的进行模块化开发，
2. 自动集成多个开发库
3. 只要将dev设为true,就可以在项目中开发调试任何模块。
4. 采用yarn的workspaces,避免依赖冗余.
5. 自动对rigs中的模块做软链接。
6. 生产环境检查，运行rig check可以防止开发中的库被部署(dev:true),一般用于部署脚本。
7. 无侵入，与一般微前端方案无冲突。

## Command

### rig init
 1. 创建"package.rig.json5"
 2. 将配置注入到package.json中
 3. 创建rigs文件夹
 4. 修改.gitignore文件
 
### rig install
等价于 "yarn install"

### rig check
如果有模块处于开发模式(dev:true)检查不会通过，构建脚本抛出异常。
该命令用于部署，以确保开发模式的代码不会被发到线上。

### rig tag
使用package.json中的version打tag
//TODO：自动检查是否存在未提交代码。

### rig --env fp_test
该指令首先会在根目录下寻找名为'env.rig.json5'的文件，然后根据所传变量fp_test去该文件读取相应配置，
最后自动将该配置写入固定名称为".env.rig"的文件。注意：类似"fp_test"的变量为必传项。

###rig info
查看模块配置信息
