/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/9 6:14 PM
 */
import print from '../print';
import fs from 'fs';

const PACKAGE_RIG_TEMPLATE = `{
  // package.rig.json5 — rig configuration
  // Field reference: see the rig-package / rig-cicd skills.
  dependencies: {
    // 'lib-name': {
    //   source: 'git@github.com:org/repo.git', // git ssh url
    //   version: '1.0.0',                      // git tag (semver)
    //   dev: false                             // true => clone into rig_dev/ and develop locally
    // }
  }
}
`;

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
      //创建package.rig.json5 — 本地模板,留空 dependencies,无示例库引用
      print.info('create package.rig.json5');
      fs.writeFileSync('./package.rig.json5', PACKAGE_RIG_TEMPLATE);
    }
    //检查是否存在rig_helper.js
    // if (fs.existsSync(`${process.cwd()}/rig_helper.js`)) {
    //   print.info('rig_helper.js already exists~');
    // } else {
    //   print.info('create rig_helper.js');
    //   const resRigHelper = await axios.get('https://gist.githubusercontent.com/FlashHand/f468123502fd7aa87933fd8e39ed6926/raw/6835c8bc56480f1ada64b99040806f1968778912/rig_helper.js');
    //   const rigHelper = resRigHelper.data;
    //   fs.writeFileSync(`${process.cwd()}/rig_helper.js`, rigHelper);
    // }
    // //检查是否存在rig_helper.d.ts
    // if (fs.existsSync(`${process.cwd()}/rig_helper.d.ts`)) {
    //   print.info('rig_helper.d.ts already exists~');
    // } else {
    //   print.info('create rig_helper.d.ts');
    //   const resRigHelperDts = await axios.get('https://gist.githubusercontent.com/FlashHand/f468123502fd7aa87933fd8e39ed6926/raw/6835c8bc56480f1ada64b99040806f1968778912/rig_helper.d.ts');
    //   const rigHelperDts = resRigHelperDts.data;
    //   fs.writeFileSync(`${process.cwd()}/rig_helper.d.ts`, rigHelperDts);
    // }
    //检查rig_dev是否存在
    if (fs.existsSync('./rig_dev') && fs.lstatSync('./rig_dev').isDirectory()) {
      print.info('folder rig_dev  already exists~');
    } else {
      print.info('create folder rig_dev');
      fs.mkdirSync('rig_dev');
      fs.writeFileSync('rig_dev/.gitkeep', '')
    }
    //检查rig_dev是否存在
    if (fs.existsSync('./rig_indies') && fs.lstatSync('./rig_indies').isDirectory()) {
      print.info('folder rig_indies  already exists~');
    } else {
      print.info('create folder rig_indies');
      fs.mkdirSync('rig_indies');
      fs.writeFileSync('rig_indies/.gitkeep', '')
    }

    //填充gitignore
    let rigIgnoreStrArr = [
      'rigs/*',
      'rig_dev/*',
      '.env.rig',
      '!rigs/.gitkeep',
      '!rig_dev/.gitkeep'
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
        "rig_dev/*"
      ],
      scripts: {
        preinstall: "rig preinstall",
        postinstall: "rig postinstall",
      },
      devDependencies: {
        json5: '2.2.1'
      }
    }
    pkgJSON.private = inserted.private;
    //初始化workspaces
    if (pkgJSON.workspaces && pkgJSON.workspaces instanceof Array) {
      if (pkgJSON.workspaces.indexOf('rig_dev/*') === -1) {
        pkgJSON.workspaces.push('rig_dev/*')
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
