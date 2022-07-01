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
        print.warn(`developing:${dep.name}`);
        devDeps.push(dep.name);
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
    print.succeed(`postinstall SUCCEED!`);
    if (devDeps.length>0){
      print.warn(`developing ${devDeps.length} modules: ${devDeps}.Installed in rig_dev/.Already linked.`)
    }
  } catch (e) {
    print.error(e.message);
  }
}
