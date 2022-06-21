import fs from 'fs';
const JSON5 = require('json5');
const readCICDConfig = () => {
	const cicdStr = fs.readFileSync(`${process.cwd()}/cicd.rig.json5`);
	return JSON5.parse(cicdStr);
}
const readConfig = ()=>{
	try{
		const rigJson5Str = fs.readFileSync(`${process.cwd()}/cicd.rig.json5`);
		return JSON5.parse(rigJson5Str);
	}catch (e) {
		throw new Error(`readConfig failed:${e.message}`);
	}
}
export default {
	readCICDConfig,
	readConfig
}
