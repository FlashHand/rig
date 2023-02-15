/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/9 6:14 PM
 */
const shell = require('shelljs');
import print from '../print';
//加载命令控制器
export default async () => {
  print.info('start installing\n');
  try {
    let yarnProcess = shell.exec('yarn install',{silent:true});
    let stderrStr = yarnProcess.stderr.toString();
    if (stderrStr && stderrStr.indexOf('postinstall SUCCEED!') >-1) {
    }else{
      throw new Error(`rig install failed:${stderrStr}`);
    }
    console.log(stderrStr);
    print.succeed(`rig install SUCCEED!`);
    //执行npm link
  } catch (e) {
    print.error(e.message);
  }
}
