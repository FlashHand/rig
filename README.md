# rig
## [中文文档](./README_CN.md)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- Commands
  - [`rig init`](#rig-init)
  - [`rig install`](#rig-install)
  - [`rig check`](#rig-check)
  - [`rig tag`](#rig-tag)


## Getting started
Should install yarn first.Rig is using yarn workspace to do hoisting.

**1.init rig**

```shell script
npm i -g yarn 
yarn global add rigjs
rig init
```
package.rig.json5 will be added to your project's root.

**2.configuring package.rig.json5**
```json5
//dev is false by default
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
**3.run install:**
```shell script
rig install
```
OR
```shell script
yarn install
```
**Result:**

r-b will be installed in node_modules.

r-c will be cloned to rigs/

"rig install" equals to "yarn install".
Because all functions are in preinstall and postinstall. 


## How it works

#### package.rig.json5

Rig is inspired by cocoapods.
Not like those popular monorepo solutions,rig is a tool for organizing multi repos.
So rig create a file named "package.rig.json5".
Data in "package.rig.json5" can look like this:
```json5
//dev is false by default
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
package.rig.json5 has an array of modules.

So rig create a folder named "rigs".

When dev is true,the module will be cloned in rigs/**(using master branch)**.

And it gets automatically linked in node_modules.

#### How rig modifies package.json

```javascript
//Rig will insert these to package.json
//Rig won't cover your preinstall or postinstall's  settings.Scripts and workspaces will be appended.
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

#### Main Features

1. Created for modular architecture.
2. An organizer for multi repos.
3. You can develop and test your module within your project.Just set **dev** to true.
4. Using yarn workspace.
5. Automatically link your developing modules in rigs/.

**How to remove your modules**

Remove your modules from both package.json and package.rig.json5 then run **rig install** or **yarn install**.

//TODO:
rig check //if has dev:true then end shell
rig tag //using package.json version

## Command

### rig init
 1. create a "package.rig.json5" file
 2. insert config to package.json
 3. create "rigs" folder
 4. modify .gitignore
 
### rig install
equals to "yarn install"

### rig check
If a module's dev status is true in "package.rig.json5",the config will not be passed!

Make sure you are not using developing modules for production.

### rig tag
Using version in package.json to tag.

### rig --env fp_test
This command automatically reads the file named "env.rig.json5" in the root directory,
  and looks for the environment variable configuration in mode "fp_test",
  and eventually generates a file for you with a fixed name of ".env.rig".
  Warning: Like "fp_test" is a mandatory variable.

## TODO
rig install不覆盖rigs下的文件
es5兼容文档
不能删除rigs下的文件




