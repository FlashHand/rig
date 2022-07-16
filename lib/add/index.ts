import regexHelper from '../utils/regexHelper';
import {Dep} from '@/classes/dependencies/Dep';
import RigConfig from '@/classes/RigConfig';
import install from '../install';
import print from '../print';
import semver from 'semver/preload';

/**
 * @desc add
 * 安装rig库
 * @returns {Promise<void>}
 */
export default async (cmd: any) => {
	try {
		print.info(`rig add`);
		const rigConfig = RigConfig.createFromCWD();
		if (rigConfig.isLegacy) throw new Error(`rig dev' does not support legacy config template`);
		const cmdArgs = cmd.args;
		//检查第一个参数是否是git url,第二个参数是否是版本号
		if (regexHelper.gitURL.test(cmdArgs[0]) && semver.valid(cmdArgs[1])) {
			//传入git url,模式2处理
			const source = cmdArgs[0];
			const gitName = source.match(regexHelper.matchGitName)[2];
			print.info(`add ${gitName}(${source}) to dev`);
			const dep = new Dep({name: gitName, source, dev: false, version: cmdArgs[1]});
			rigConfig.findOrUpsertDep(gitName, dep);
		} else {
			throw new Error(`arg[0] needs to be git url;arg[1] needs to be semver`);
		}
		console.log('do overwritting');
		rigConfig.overwrite();
		console.log('do installing');
		await install()
	} catch (e) {
		throw new Error(`rig add failed:${e.message}`);
	}
}
