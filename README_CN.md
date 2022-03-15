# rig
- [快速开始](#快速开始)
- [工作机制](#工作机制)
- 命令
  - [`rig init`](#rig-init)
  - [`rig install`](#rig-install)
  - [`rig check`](#rig-check)
  - [`rig tag`](#rig-tag)


## 快速开始
**0.必要前提**
必须安装yarn,rig采用yarn workspaces实现依赖晋升。

**1.init rig**

```shell script
npm i -g yarn 
yarn global add rigjs
rig init
```
package.rig.json5 会被添加到工程根目录

**2.配置 package.rig.json5**
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
