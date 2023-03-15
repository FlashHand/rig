/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/9 6:14 PM
 */
import shell from 'shelljs';
import fs from 'fs';
import path from 'path';
import print from '../print';
import RigConfig from '@/classes/RigConfig';

//link开发库
export default async () => {
  print.info('rig postinstall start linking dependencies')
  try {
    if (!fs.existsSync('node_modules')) {
      shell.mkdir('node_modules');
    }
    const rigConfig = RigConfig.createFromCWD();
    let rootPath = shell.pwd().stdout;
    let devDeps = [];
    for (let rigName in rigConfig.dependencies) {
      const dep = rigConfig.dependencies[rigName];
      if (dep.dev) {
        //link rig_dev下的库
        print.warn(`developing:${dep.name}`);
        devDeps.push(dep.name);
        //删除现有同名目录或快捷方式
        if (fs.existsSync(`node_modules/${dep.name}`)) {
          shell.rm('-rf', `node_modules/${dep.name}`);
        }
        fs.symlinkSync(
          path.resolve(rootPath, `./rig_dev/${dep.name}`),
          path.resolve(rootPath, `./node_modules/${dep.name}`),
          'dir'
        );
      }
    }
    //还原被package.json中被标记为*的库
    let pkgJson = JSON.parse(fs.readFileSync('package.json').toString());
    let dependencies = pkgJson['dependencies'];
    for (let rigName in rigConfig.dependencies) {
      const dep = rigConfig.dependencies[rigName];
      if (dep.dev) {
        dependencies[dep.name] = `git+ssh://${dep.source}#${dep.version}`
      }
    }
    pkgJson.dependencies = dependencies;
    fs.writeFileSync('package.json', JSON.stringify(pkgJson, null, 2));

    print.succeed(`postinstall SUCCEED!`);
    if (devDeps.length > 0) {
      print.warn(`developing ${devDeps.length} modules: ${devDeps}.Installed in rig_dev/.Already linked.`)
    }
  } catch (e) {
    print.error(e.message);
  }
}
