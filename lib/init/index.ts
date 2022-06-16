/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/9 6:14 PM
 */
import {packageRigJSON5, rigHelper} from '../template';
import print from '../print';
import fs from 'fs';

export default async () => {
  try {
    print.start('init rig...');
    //检查当前目录是否存在package.json
    if (!(fs.existsSync('package.json') && fs.lstatSync('package.json').isFile())) {
      throw new Error('Please run this in the root directory of project!Must have a validate package.json');
    }
    //检查是否存在package.rig.json5
    if (fs.existsSync('package.rig.json5')) {
      print.info('package.rig.json5 already exists~');
    } else {
      //创建package.rig.json5
      print.info('create package.rig.json5');
      fs.writeFileSync('./package.rig.json5', packageRigJSON5);
    }
    if (fs.existsSync(`${process.cwd()}/rig_helper.js`)) {
      print.info('rig_helper.js already exists~');
    } else {
      print.info('create rig_helper.js');
      fs.writeFileSync(`${process.cwd()}/rig_helper.js`, rigHelper);
    }

    //检查rigs是否存在
    if (fs.existsSync('./rigs') && fs.lstatSync('./rigs').isDirectory()) {
      print.info('folder rigs  already exists~');
    } else {
      print.info('create folder rigs');
      fs.mkdirSync('rigs');
      fs.writeFileSync('rigs/.gitkeep', '')
    }

    //填充gitignore
    let rigIgnoreStrArr = [
      'rigs/*',
      'rigs_dev/*',
      '.env.rig',
      '!rigs/.gitkeep',
      '!rigs_dev/.gitkeep'
    ];
    let gitignoreStr = ''
    if (fs.existsSync('.gitignore')) {
      gitignoreStr = fs.readFileSync('.gitignore').toString();
    }
    for (let i of rigIgnoreStrArr) {
      if (gitignoreStr.indexOf(i) > -1) {
        print.info(`${i} already in .gitignore`);
      } else {
        print.info(`append ${i} to .gitignore`);
        gitignoreStr += '\n' + i;
      }
    }
    fs.writeFileSync('.gitignore', gitignoreStr);
    //modify package.json
    let pkgJSONStr = fs.readFileSync('./package.json').toString();
    let pkgJSON = JSON.parse(pkgJSONStr);
    let inserted = {
      private: true,
      workspaces: [
        "rigs/*",
        "rigs_dev/*"
      ],
      scripts: {
        preinstall: "rig preinstall",
        postinstall: "rig postinstall",
      },
      devDependencies: {
        json5: '2.1.3'
      }
    }
    pkgJSON.private = inserted.private;
    //初始化workspaces
    if (pkgJSON.workspaces && pkgJSON.workspaces instanceof Array) {
      if (pkgJSON.workspaces.indexOf('rigs/*') === -1) {
        pkgJSON.workspaces.push('rigs/*')
      }
      if (pkgJSON.workspaces.indexOf('rigs_dev/*') === -1) {
        pkgJSON.workspaces.push('rigs_dev/*')
      }

    } else {
      pkgJSON.workspaces = inserted.workspaces
    }
    //初始化pre/post-install
    if (pkgJSON.scripts && pkgJSON.scripts instanceof Object) {
      if (pkgJSON.scripts.preinstall && pkgJSON.scripts.preinstall.indexOf(inserted.scripts.preinstall) < 0) {
        pkgJSON.scripts.preinstall = `${pkgJSON.scripts.preinstall} && ${inserted.scripts.preinstall}`
      } else {
        pkgJSON.scripts.preinstall = inserted.scripts.preinstall;
      }
      if (pkgJSON.scripts.postinstall && pkgJSON.scripts.postinstall.indexOf(inserted.scripts.postinstall) < 0) {
        pkgJSON.scripts.postinstall = `${pkgJSON.scripts.postinstall} && ${inserted.scripts.postinstall}`
      } else {
        pkgJSON.scripts.postinstall = inserted.scripts.postinstall;
      }
    } else {
      pkgJSON.scripts = inserted.scripts
    }
    if (pkgJSON.devDependencies) {
      pkgJSON.devDependencies.json5 = inserted.devDependencies.json5;
    } else {
      pkgJSON.devDependencies = inserted.devDependencies;
    }
    fs.writeFileSync('package.json', JSON.stringify(pkgJSON, null, 2));
    print.succeed('rig init succeed');
  } catch (e) {
    print.error(e.message);
  }
};
