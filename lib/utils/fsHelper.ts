import fs from 'fs';

const JSON5 = require('json5');
const readCICDConfig = () => {
	const cicdStr = fs.readFileSync(`${process.cwd()}/cicd.rig.json5`);
	return JSON5.parse(cicdStr);
}
export default {
	readCICDConfig
}
