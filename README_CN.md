# rig
- [dependencies配置](./doc/dependencies_cn.md)

## 快速开始
### 0.前提准备
1. 安装yarn.
2. node版本高于14.
3. 依赖库必须使用git+ssh链接,不支持http/https链接.
4. 以下rig库统一指代在可以用rig管理的仓库.

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

通过yarn add新的依赖时需要增加-W参数,如:
```shell
yarn add axios -W
```
### 2.使用rig安装现有的代码库
version是git的tag

如下:
```json5
{
  dependencies: {
    'rig-demo-1': {
      source: 'git@github.com:FlashHand/rig-demo-1.git',
      version: '0.0.1',
    },
    'rig-demo-2': {
      source: 'git@github.com:FlashHand/rig-demo-2.git',
      version: '0.0.1',
    }
  }
}
```
然后执行
```shell
yarn install
```

### 3.开发一个新的rig库或改造现有仓库为rig库
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

### rig env [mode]
从env.rig.json5中指定一组环境变量,并覆盖到.env.rig文件中

### rig tag
在git仓库nothing to commit后执行,可以将package.json中的版本打为tag

