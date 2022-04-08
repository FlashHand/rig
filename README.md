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
###Prerequisites
- Should install yarn first.Rig is using yarn workspace to do module-hoisting.
```shell
npm i -g yarn
```

###Installation

```shell script
yarn global add rigjs
```

###Configuration
You could try the demo for quick practice.

####1.init rig in your project
In your project's root path.

```shell script
rig init
```

package.rig.json5 will be added to your project's root.

####2.Put the modules you want in git repos
- Create semver style tag for your modules 
  
- Tags like 1,1.0,1.0.0,v1.0.0-alpha.110 are supported.

Or you can just use following repos for testing:

rig-test-1:git@github.com:FlashHand/rig-test-1.git

rig-test-2:git@github.com:FlashHand/rig-test-2.git

####3.configuring package.rig.json5

***copy this and try***
```json5
//dev is false by default
[
  //  {
  //    name: 'module',//module's name
  //    source: 'git@git.domain.com:path/module.git',//module's source,not supporting http for now.
  //    version: '1.0.0',//Notice:this used as tag.module's version ,
  //  },
  {
    name: 'rig-test-1',
    source: 'git@github.com:FlashHand/rig-test-1.git',
    version: '1.0.0',
  },
  {
    name: 'rig-test-2',
    source: 'git@github.com:FlashHand/rig-test-2.git',
    version: '1.0.1',
    dev: true
  }
]
```

####4.run install:
```shell script
yarn
```

**Result:**

rig-test-1 will be installed in node_modules.

rig-test-2 will be cloned to rigs/.A shortcut of rig-test-2 will be created in node_modules.

## Main Features
###Intergrating and reusing codes really fast.
1. Git is enough.No need to publish to npm or private registry.
2. Much simpler than git submodule.

###Easily develop and debug modules inside your project.

###All modules managed by rigjs are flatten.



1. Put the modules you wanna intergrating in git repos.
2. Configure those modules in


1. Integrating other git reposCreated for modular architecture.
2. An organizer for multi repos.
3. You can develop and test your module within your project just by setting **dev** to true,then rigjs automatically create shortcuts in node_modules folder for your developing modules in rigs folder.
4. Modules are hoisted,because rigjs uses yarn's workspace.
5. Automatically create shortcuts in node_modules folder for your developing modules in rigs folder.


## How it works

#### package.rig.json5

Rig is inspired by cocoapods. Not like those popular monorepo solutions,rig is a tool for organizing multi repos. So rig
create a file named "package.rig.json5". Data in "package.rig.json5" can look like this:

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
	scripts: {
		preinstall: "rig preinstall",
		postinstall: "rig postinstall",
	}
}
```

**How to remove your modules**

Remove your modules from both package.json and package.rig.json5 then run **rig install** or **yarn install**.

//TODO:
rig check //if has dev:true then end shell rig tag //using package.json version

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

### rig --vueenv  <env>

This command is specially for vue.This command reads the file named "env.rig.json5" in the root directory, and looks for
the environment configuration in mode <env>.Then it will create a file named ".env.rig" or overwrite the file if ".env.rig" is not
existed.
After "rig --vueenv" you must use "--mode rig" to make it effective.
e.g.
```shell
#serving a local site in dev enviroment
rig --env dev && vue-cli-service serve --mode rig
#building a site in prod enviroment
rig --env prod && vue-cli-service build --mode rig
```



