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
const nodeMin = '22.0.0';
if (semver.gte(nodeMin,process.version)){
	print.error('NodeJS version must be at least 22 (better-sqlite3 12.x prebuilds require it).');
	process.exit(0);
}
import {Command} from 'commander';

// Short-circuit `-c` / `--versioncode` before commander parses subcommands,
// mirroring how commander handles `-v` itself.
if (process.argv.some(a => a === '-c' || a === '--versioncode')) {
	const pkg = require('../../package.json');
	// eslint-disable-next-line no-console
	console.log(pkg.versionCode ?? '');
	process.exit(0);
}

const program = new Command();
program.name('rig').description('Agent-facing multi-repo, wiki, orchestration, and Claude-to-Codex tooling');

import check from '../check';

program.command('check').description('validate the current Rig workspace and dependencies').action(check.load);
import init from '../init';

program.command('init').description('initialize package.rig.json5 in the current project').action(init);
import install from '../install';

program.command('install').description('install dependencies declared in package.rig.json5').action(install);
program.command('i').description('alias for install').action(install);

import installLocal from '../installLocal';

program.command('install-local')
	.description('build the current source tree and install it as the global `rig`')
	.option('--skip-build', 'skip `yarn build` (use existing built/index.js)')
	.option('--manager <name>', 'npm | yarn (default: npm)')
	.action(installLocal);

program.command('preinstall').description('internal package lifecycle: prepare Rig dependencies').action(preinstall);
program.command('postinstall').description('internal package lifecycle: link Rig development dependencies').action(postinstall);
import tag from '../tag';

program.command('tag').description('create the configured git release tag for the current package').action(tag.load);
import info from '../info';

program.command('info').description('compare configured dependency tags with their remotes').action(info.load);

program.command('add <git-url> <semver-tag>')
	.description('add a tagged git dependency, then install it')
	.action((_source, _version, command) => add(command));

program.command('dev <name-or-git-url>')
	.description('switch a Rig dependency into local development mode')
	.action((_dependency, command) => dev(command));

program.command('build <dir-path>')
	.description('build endpoints declared in the Rig CI/CD configuration')
	.option('-s, --schema <query>', 'values for {keys} in tree_schema, e.g. env=test&oem=oem1')
	.option('-p, --params <query>', 'values for ${keys} in config, e.g. region=cn&stage=test')
	.action((_dirPath, command) => build(command));
// import define from '../define';
//
// program.command('define')
// 	.option('-s, --schema <schema>', 'specify params in tree_schema')
// 	.option('-p , --params <params>', 'replace words in cicd.rig.json5, only words in ${} are replacable')
// 	.action(define);
program.command('deploy <dir-path>')
	.description('deploy built endpoints declared in the Rig CI/CD configuration')
	.option('-s, --schema <query>', 'values for {keys} in tree_schema, e.g. env=test&oem=oem1')
	.option('-p, --params <query>', 'values for ${keys} in config, e.g. region=cn&stage=test')
	.action((_dirPath, command) => deploy(command));

program.command('publish <dir-path>')
	.description('publish CDN routing for deployed Rig endpoints')
	.option('-s, --schema <query>', 'values for {keys} in tree_schema, e.g. env=test&oem=oem1')
	.option('-p, --params <query>', 'values for ${keys} in config, e.g. region=cn&stage=test')
	.action((_dirPath, command) => publish(command));

program.command('sync')
	.description('synchronize files declared by package.rig.json5')
	.option('-f, --force <force>', 'force to overwrite files from package.rig.json5')
	.action(sync);

import { registerWikiCommands } from '../wiki';
registerWikiCommands(program);

import { registerCrewCommands } from '../crew';
registerCrewCommands(program);

import { registerHandoffCommands } from '../handoff';
registerHandoffCommands(program);

import { registerGuideCommands } from '../guide';
registerGuideCommands(program);

import env from '../env';

program.option('--env <env>', 'specify env').action(env.load);

program.version(require('../../package.json').version, '-v,--version');
program.option('-c, --versioncode', 'output the version code (YYMMDDNN)');
program.parse(process.argv);
