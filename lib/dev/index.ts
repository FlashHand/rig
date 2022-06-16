import print from '../print';
import regexHelper from '../utils/regexHelper';
/**
 * @desc dev
 * 模式1. 激活某个rig库的dev模式。
 * 模式2. 安装rig库的git ssh url,并设为dev模式
 * @returns {Promise<void>}
 */
export default async (cmd:any) => {
	try{
		const cmdArgs = cmd.args;
		if (regexHelper.gitURL.test(cmdArgs[0])){
			//模式2处理

		}else{
			//模式1处理
		}
	}catch (e) {

	}
}
