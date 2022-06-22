import fs from 'fs';

const JSON5 = require('json5');
const readCICDConfig = () => {
	const cicdStr = fs.readFileSync(`${process.cwd()}/cicd.rig.json5`);
	return JSON5.parse(cicdStr);
}
/**
 * 读取rig配置文件
 * @param {string} path absolute path to config json5.
 * @returns {any}
 */
const readConfig = (path: string = '') => {
	try {
		if (path) {
			const rigJson5Str = fs.readFileSync(path);
			return JSON5.parse(rigJson5Str);
		}
		const rigJson5Str = fs.readFileSync(`${process.cwd()}/cicd.rig.json5`);
		return JSON5.parse(rigJson5Str);
	} catch (e) {
		throw new Error(`readConfig failed:${e.message}`);
	}
}
export default {
	readCICDConfig,
	readConfig
}
