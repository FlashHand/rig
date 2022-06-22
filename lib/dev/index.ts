import print from '../print';
import regexHelper from '../utils/regexHelper';
import {Dep} from '@/classes/dependencies/Dep';
import RigConfig from '@/classes/RigConfig';

/**
 * @desc dev
 * 模式1: 激活某个rig库的dev模式：修改package.rig.json5->执行install
 * 模式2: 安装rig库的git ssh url,并设为dev模式:修改package.rig.json5->执行install
 * @returns {Promise<void>}
 */
export default async (cmd:any) => {
	try{
		const rigConfig = RigConfig.createFromCWD();
		const cmdArgs = cmd.args;
		if (regexHelper.gitURL.test(cmdArgs[0])){
			//传入git url,模式2处理
			const source = cmdArgs[0];
			const gitName = source.match(regexHelper.matchGitName)[2];
			const dep = new Dep({name:gitName,source, dev: true});
			/**
			 * 查找依赖配置，若已存在
			 */
			rigConfig.findOrUpsertDep(gitName, dep);
		}else{
			//传入git名称，模式1处理

		}
	}catch (e) {

	}
}
