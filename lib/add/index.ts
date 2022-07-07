import regexHelper from '../utils/regexHelper';
import {Dep} from '@/classes/dependencies/Dep';
import RigConfig from '@/classes/RigConfig';
import install from '../install';
import print from '../print';

/**
 * @desc add
 * 安装rig库
 * @returns {Promise<void>}
 */
export default async (cmd: any) => {
	try {
		print.info(`rig add`);
		const rigConfig = RigConfig.createFromCWD();
		console.log(rigConfig);
		if (rigConfig.isLegacy) throw new Error(`rig dev' does not support legacy config template`);
		const cmdArgs = cmd.args;
		if (regexHelper.gitURL.test(cmdArgs[0])) {
			//传入git url,模式2处理
			const source = cmdArgs[0];
			const gitName = source.match(regexHelper.matchGitName)[2];
			print.info(`add ${gitName}(${source}) to dev`);

			const dep = new Dep({name: gitName, source, dev: true});
			rigConfig.findOrUpsertDep(gitName, dep);
		} else {
			const gitName = cmdArgs[0];
			print.info(`set ${gitName} to dev`);
			//传入git名称，模式1处理
			if (rigConfig.checkDepExists(gitName)) {
				rigConfig.setDependencyToDev(gitName);
			} else {
				throw new Error(`Cannot find ${gitName} in rig-dependencies.See '' to add a rig-dependency.`);
			}
		}
		console.log('do overwritting');
		rigConfig.overwrite();
		console.log('do installing');
		await install()
	} catch (e) {
		throw new Error(`rig dev failed:${e.message}`);
	}
}
