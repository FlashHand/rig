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


const load = async () => {
	try {
		let pkgJson = JSON.parse(fs.readFileSync('package.json').toString());
		let pkgJson5 = json5.parse(fs.readFileSync('package.rig.json5').toString());

		console.log(pkgJson);
		let version = pkgJson.version;
		if (!fs.existsSync('.git')) {
			print.error('.git not found at the level of package.json');
			print.error('should run "rig tag" in the directory with both .git and package.json');
			process.exit(1)
		}
		let statusProcess = shell.exec('git status', {silent: true});
		if (statusProcess.stdout.indexOf('nothing to commit') >= 0) {
			if(pkgJson5.tag_template){
				let tagStr = `${pkgJson5.tag_template}`;

				try{
					const fields = pkgJson5.tag_template.match(/(?<={)[^{}]+(?=})/g)
					fields.forEach((field: string) => {
						const value = pkgJson[field];
						if (value) {
							tagStr.replace(`{${field}}`, value)
						} else {
							print.error(`field:${field} not found in package.json`);
							process.exit(1)
						}
					});
					shell.exec(`git tag ${tagStr}`);
					print.succeed(`tag:${tagStr} created.`);
				}catch(e:any){
					print.error(`create tag failed:${e.message}`);
					process.exit(1)
				}
			}else{
				shell.exec(`git tag ${version}`);
				print.succeed(`tag:${version} created.`);
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