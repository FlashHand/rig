/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/15 3:28 PM
 */
const fs = require('fs');
const shell = require('shelljs');
const chalk = require('chalk');
const print = require('../print');
let red = chalk.red;


const load = async () => {
	try {
		let pkgJson = JSON.parse(fs.readFileSync('package.json').toString());
		let version = pkgJson.version;
		if (!fs.existsSync('.git')) {
			print.error('.git not found at the level of package.json');
			print.error('should run "rig tag" in the directory with both .git and package.json');
			process.exit(1)
		}
		let statusProcess = shell.exec('git status', {silent: true});
		if (statusProcess.stdout.indexOf('nothing to commit') >= 0) {
			shell.exec(`git tag ${version}`);
			print.succeed(`tag:${version} created.`);
		} else {
			print.error(statusProcess.stdout);
			process.exit(1)
		}
	} catch (e) {
		console.log(red(e.message));
		process.exit(1);
	}
}
module.exports = {
	load
}
