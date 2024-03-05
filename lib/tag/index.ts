/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/15 3:28 PM
 */
const fs = require('fs');
import shell, {cat} from "shelljs";
import chalk from "chalk";
import print from '../print'
import json5 from 'json5';

let red = chalk.red;

const exec = (cmd:string)=>{
	shell.exec(`cmd`,(code, stdout, stderr)=>{
		if (stderr){
			print.error(stderr);
		}else{
			print.succeed(`success: ${cmd}`);
		}
	});
}
const load = async () => {
	try {
		let pkgJson = JSON.parse(fs.readFileSync('package.json').toString());
		let pkgJson5 = null
		try{
			pkgJson5 = json5.parse(fs.readFileSync('package.rig.json5').toString());
		}catch (e) {
			print.warn('no validate package.rig.json5 found, use package.json')
		}

		let version = pkgJson.version;
		if (!fs.existsSync('.git')) {
			print.error('.git not found at the level of package.json');
			print.error('should run "rig tag" in the directory with both .git and package.json');
			process.exit(1)
		}
		let statusProcess = shell.exec('git status', {silent: true});
		if (statusProcess.stdout.indexOf('nothing to commit') >= 0) {
			if(pkgJson5&&pkgJson5.tag_template){
				let tagStr = `${pkgJson5.tag_template}`;

				try{
					const fields = pkgJson5.tag_template.match(/(?<={)[^{}]+(?=})/g)
					fields.forEach((field: string) => {
						const value = pkgJson[field];
						if (value) {
							tagStr = tagStr.replace(`{${field}}`, value)
						} else {
							print.error(`field:${field} not found in package.json`);
							process.exit(1)
						}
					});
					exec(`git tag ${tagStr}`);
					print.succeed(`tag:${tagStr} created.`);
				}catch(e:any){
					print.error(`create tag failed:${e.message}`);
					process.exit(1)
				}
			}else if (pkgJson&&pkgJson.rig_tag_template){
				let tagStr = `${pkgJson.rig_tag_template}`;

				try{
					const fields = pkgJson.rig_tag_template.match(/(?<={)[^{}]+(?=})/g)
					fields.forEach((field: string) => {
						const value = pkgJson[field];
						if (value) {
							tagStr = tagStr.replace(`{${field}}`, value)
						} else {
							print.error(`field:${field} not found in package.json`);
							process.exit(1)
						}
					});
					exec(`git tag ${tagStr}`)
				}catch(e:any){
					print.error(`create tag failed:${e.message}`);
					process.exit(1)
				}
			}else{
				exec(`git tag ${version}`)
			}
		} else {
			print.error('please commit your changes before tag');
			print.error(statusProcess.stdout);
			process.exit(1)
		}
	} catch (e) {
		console.log(red(e.message));
		process.exit(1);
	}
}
export default {
	load,
}