/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/20 6:58 PM
 */
import shell from "shelljs";
import * as fs from 'fs'
import print from "@/print";
import json5 from 'json5';
//加载命令控制器
const info = () => {
	console.log('process.platform');
	print.info(`start checking modules|OS:${process.platform} `);
	let rigJson5 = json5.parse(fs.readFileSync('package.rig.json5').toString());
	const depKeyArr = Object.keys(rigJson5.dependencies);
	for (let depKey of depKeyArr) {
		const dep = rigJson5.dependencies[depKey];
		if (process.platform === 'win32'){
			print.info(`skip info on windows`);
			return;
		}
		let describeProcess = process.platform === 'win32'?shell.exec(`git ls-remote --tags --refs --sort="version:refname" ${dep.source} | awk -F/ "END{print$NF}"`,
			{silent: true}
		):  shell.exec(`git ls-remote --tags --refs --sort="version:refname" ${dep.source} | awk -F/ 'END{print$NF}'`,
			{silent: true}
		);
		let remoteLatestTag = describeProcess.stdout.trim();
		if (dep.dev) {
			print.warn(`[${dep.name}] is in developing.latest:${remoteLatestTag},`);
		} else {
			if (remoteLatestTag) {
				if (dep.version === remoteLatestTag) {
					print.info(`[${dep.name}] using:${dep.version},latest:${remoteLatestTag}`);
				} else {
					print.warn(`[${dep.name}] using:${dep.version},latest:${remoteLatestTag},Please confirm before updating!!!`);
				}
			} else {
				print.error(`Get latest tag of ${dep.name} failed!Error:${describeProcess.stderr}`);
			}
		}
	}

}
const load = async () => {
	info();
}
export default {
	load,
	info,
}
