/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/9 6:14 PM
 */
const shell = require('shelljs');
const fs = require('fs');
const json5 = require('json5');
const print = require('../print');
let semverReg = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?$/;
let gitUrlReg = /(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\.git)(\/?|\#[-\d\w._]+?)$/;
const validateName = (name) => {
  if (name) {
    return true;
  } else {
    print.error(`name value(${name}) invalidate！`);
    return false;
  }
}
const validateSource = (source) => {
  let isValidate;
  try {
    isValidate = gitUrlReg.test(source);
  } catch (e) {
    isValidate = false;
    print.error(e.message);
  }
  if (!isValidate) {
    print.error(`source value(${source}) invalidate！`);
  }
  return isValidate;
}
const validateVersion = (version) => {
  let isValidate;
  try {
    isValidate = semverReg.test(version);
  } catch (e) {
    isValidate = false;
    print.error(e.message);
  }
  if (!isValidate) {
    print.error(`version value(${version}) invalidate！`);
  }
  return isValidate;
}
const validate = (rigJson5) => {
  let isValidate = true;
  try {
    for (let dep of rigJson5) {
      if (!(validateName(dep.name) && validateSource(dep.source) && validateVersion(dep.version))) {
        isValidate = false;
        print.error(`!INVALID CONFIG!:${JSON.stringify(dep)}`);
        break;
      }
    }
  } catch (e) {
    print.error(e.message);
    isValidate = false;
  }
  if (!isValidate) {
    print.info(`Visit https://github.com/FlashHand/rig for documentation`);
  }
  return isValidate;
}
const clone = (target, dep) => {
  print.info(`cloning ${dep.name}`);
  let cloneProcess = shell.exec(`git clone ${dep.source} ${target}/${dep.name}`,
    {silent: true}
  );
  if (cloneProcess.stderr && !fs.existsSync(`${target}/${dep.name}`)) {
    print.error(`clone failed:${dep.source}`);
    print.error(cloneProcess.stderr);
    process.exit(1);
  }
}
//加载命令控制器
const load = async (cmd) => {
  print.info('start rig preinstall');
  try {
    //读取package.rig.json5
    let rigJson5Str = fs.readFileSync('package.rig.json5');
    let rigJson5 = json5.parse(rigJson5Str);
    if (!validate(rigJson5)) process.exit(1);
    //重置rigs
    if (!(fs.existsSync('./rigs') && fs.lstatSync('./rigs').isDirectory())) {
      print.info('create folder rigs');
      fs.mkdirSync('rigs');
      fs.writeFileSync('rigs/.gitkeep', '')
    }
    shell.chmod('777', 'rigs');
    let target = 'rigs';
    let pkgJson = JSON.parse(fs.readFileSync('package.json').toString());
    let dependencies = pkgJson['dependencies'];
    /**
     * 核心原则
     * 1. install 不应该覆盖或删除已经clone到rigs下的模块，由开发者自己选择要不要删
     * 2. rigs下的模块更新，由开发者自己git操作解决。
     */
    for (let dep of rigJson5) {
      if (dep.dev) {
        //不去覆盖已下载的库
        if (fs.existsSync(`${target}/${dep.name}`)) {
          print.info(`${dep.name} already exists.`);
        } else {
          clone(target, dep);
        }
      } else {
        //不是开发中状态,不处理，不去删除已下载的模块
        //预安装时在node_modules中要先清除json5里的库
        if (fs.existsSync(`node_modules/${dep.name}`)) {
          shell.rm('-rf', `node_modules/${dep.name}`);
        }
        if (fs.existsSync(`node_modules/.yarn-integrity`)) {
          shell.rm('-rf', `node_modules/.yarn-integrity`);
        }
      }
      dependencies[dep.name] = `git+ssh://${dep.source}#${dep.version}`
    }
    //覆盖package.json
    pkgJson.dependencies = dependencies;
    fs.writeFileSync('package.json', JSON.stringify(pkgJson, null, 2));
    //收尾
    print.succeed(`preinstall SUCCEED! Will do "yarn install"`);
    //远程链接设置完成，开发库设置完成，准备执行yarn install
  } catch (e) {
    print.error(e.message);
  }
}
module.exports = {
  name: 'install',
  load
}
