import semver from 'semver';
import print from '../print';
import add from '../add';
import dev from '../dev';
import preinstall from '../preinstall';
import postinstall from '../postinstall';
import build from '../build';
import deploy from '../deploy';
import publish from '../publish';

import sync from '../sync';
const nodeMin = '14.0.0';
if (semver.gte(nodeMin,process.version)){
	print.error('NodeJS version must be at least 14.');
	process.exit(0);
}
import {Command} from 'commander';

const program = new Command();

import check from '../check';

program.command('check').action(check.load);
import init from '../init';

program.command('init').action(init);
import install from '../install';

program.command('install').action(install);
program.command('i').action(install);

program.command('preinstall').action(preinstall);
program.command('postinstall').action(postinstall);
import tag from '../tag';

program.command('tag').action(tag.load);
import info from '../info';

program.command('info').action(info.load);

program.command('add').action(add);

program.command('dev').action(dev);

program.command('build')
	.option('-s, --schema <schema>', 'specify params in tree_schema')
	.option('-p , --params <params>', 'replace words in cicd.rig.json5, only words in ${} are replacable')
	.action(build);
// import define from '../define';
//
// program.command('define')
// 	.option('-s, --schema <schema>', 'specify params in tree_schema')
// 	.option('-p , --params <params>', 'replace words in cicd.rig.json5, only words in ${} are replacable')
// 	.action(define);
program.command('deploy')
	.option('-s, --schema <schema>', 'specify params in tree_schema')
	.option('-p , --params <params>', 'replace words in cicd.rig.json5, only words in ${} are replacable')
	.action(deploy);

program.command('publish')
	.option('-s, --schema <schema>', 'specify params in tree_schema')
	.option('-p , --params <params>', 'replace words in cicd.rig.json5, only words in ${} are replacable')
	.action(publish);

program.command('sync')
	.option('-f, --force <force>', 'force to overwrite files from package.rig.json5')
	.action(sync);

import env from '../vue-env';

program.option('--vueenv <vueenv>', 'specify vue env').action(env.load);
program.version(require('../../package.json').version, '-v,--version');
program.parse(process.argv);

