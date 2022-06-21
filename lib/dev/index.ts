import print from '../print';
import regexHelper from '../utils/regexHelper';
const overwriteDep = ()=>{

}
import {Dep,DepCollection} from '@/classes/dependencies/Dep';

/**
 * @desc dev
 * 模式1: 激活某个rig库的dev模式：修改package.rig.json5->执行install
 * 模式2: 安装rig库的git ssh url,并设为dev模式:修改package.rig.json5->执行install
 * @returns {Promise<void>}
 */
export default async (cmd:any) => {
	try{
		const depCollection = DepCollection.createFromConfig();
		const cmdArgs = cmd.args;
		if (regexHelper.gitURL.test(cmdArgs[0])){
			//传入git url,模式2处理
			const source = cmdArgs[0];

			const gitName = source.match(regexHelper.matchGitName)[2];
			const dep =  new Dep({name:gitName,source, dev: true});
			if (depCollection.checkDepExists(gitName)) {
				depCollection.dependencies[gitName].dev = true;
			}else{
				depCollection.dependencies[gitName] = dep;
			}
		}else{
			//传入git名称，模式1处理

		}
	}catch (e) {

	}
}
