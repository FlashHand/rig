/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/9 6:14 PM
 */
const shell = require('shelljs');
const fs = require('fs');
const json5 = require('json5');
const path = require('path');
const print = require('../print');
const info = require('../info');

//link开发库
const load = async (cmd) => {
  print.info('start linking dependencies')
  try {
    if (!fs.existsSync('node_modules')) {
      shell.mkdir('node_modules');
    }
    let rootPath = shell.pwd().stdout;
    let rigJson5 = json5.parse(fs.readFileSync('package.rig.json5'));
    console.log(rigJson5);
    let devDeps = [];
    for (let dep of rigJson5) {

      if (dep.dev) {
        print.warn(`developing:${dep.name}`);
        devDeps.push(dep.name);
        if (fs.existsSync(`node_modules/${dep.name}`)) {
          shell.rm('-rf', `node_modules/${dep.name}`);
        }
        fs.symlinkSync(
          path.resolve(rootPath, `./rigs/${dep.name}`),
          path.resolve(rootPath, `./node_modules/${dep.name}`),
          'dir'
        );
      }
      //TODO:检查依赖间的版本号要求
    }
    info.info();
    print.succeed(`postinstall SUCCEED!`);
    if (devDeps.length>0){
      print.warn(`developing ${devDeps.length} modules: ${devDeps}.Installed in rigs/.Already linked.`)
    }
  } catch (e) {
    print.error(e.message);
  }
}
module.exports = {
  name: 'install',
  load
}
