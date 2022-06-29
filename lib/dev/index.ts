import regexHelper from '../utils/regexHelper';
import {Dep} from '@/classes/dependencies/Dep';
import RigConfig from '@/classes/RigConfig';
import install from '../install';


/**
 * @desc dev
 * 模式1: 激活某个rig库的dev模式：修改package.rig.json5->执行install
 * 模式2: 安装rig库的git ssh url,并设为dev模式:修改package.rig.json5->执行install
 * @returns {Promise<void>}
 */
export default async (cmd: any, path: string = '', shouldInstall: boolean = true) => {
	try {
		const rigConfig = path ? RigConfig.createFromPath(path) : RigConfig.createFromCWD();
		const cmdArgs = cmd.args;
		if (regexHelper.gitURL.test(cmdArgs[0])) {
			//传入git url,模式2处理
			const source = cmdArgs[0];
			const gitName = source.match(regexHelper.matchGitName)[2];
			const dep = new Dep({name: gitName, source, dev: true});
			rigConfig.findOrUpsertDep(gitName, dep);
		} else {
			const gitName = cmdArgs[0];
			//传入git名称，模式1处理
			if (rigConfig.checkDepExists(gitName)) {
				rigConfig.setDependencyToDev(gitName);
			} else {

				throw new Error(`Cannot find ${gitName} in rig-dependencies.See '' to add a rig-dependency.`);
			}
		}
		console.log('do overwritting');
		rigConfig.overwrite(path);
		console.log('do installing');
		if (shouldInstall) await install()
	} catch (e) {
		throw new Error(`rig dev failed:${e.message}`);
	}
}
