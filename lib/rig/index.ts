import {Command} from 'commander';

const program = new Command();
console.log('Hello');

import check from '../check';

program.command('check').action(check.load);
import init from '../init';

program.command('init').action(init.load);
import install from '../install';

program.command('install').action(install.load);
program.command('i').action(install.load);
import preinstall from '../preinstall';
import postinstall from '../postinstall';

program.command('preinstall').action(preinstall.load);
program.command('postinstall').action(postinstall.load);
import tag from '../tag';

program.command('tag').action(tag.load);
import info from '../info';

program.command('info').action(info.load);
import build from '../build';

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
import deploy from '../deploy';

program.command('deploy')
	.option('-s, --schema <schema>', 'specify params in tree_schema')
	.option('-p , --params <params>', 'replace words in cicd.rig.json5, only words in ${} are replacable')
	.action(deploy);

import publish from '../publish';

program.command('publish')
	.option('-s, --schema <schema>', 'specify params in tree_schema')
	.option('-p , --params <params>', 'replace words in cicd.rig.json5, only words in ${} are replacable')
	.action(deploy);

import env from '../env';

program.option('-e, --env <env>', 'specify env').action(env.load);
program.version(require('../../package.json').version, '-v,--version');
program.parse(process.argv);
