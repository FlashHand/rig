/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/9 6:14 PM
 */
import shell from 'shelljs';
import fs from 'fs';
import print from '../print';
import RigConfig from '@/classes/RigConfig';
import {Dep} from '@/classes/dependencies/Dep';

// let semverReg = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?$/;
const clone = (target:string, dep:Dep) => {
	print.info(`cloning ${dep.name}`);
	let cloneProcess = shell.exec(`git clone ${dep.source} ${target}/${dep.name}`,
		{silent: true}
	);
	if (cloneProcess.stderr && !fs.existsSync(`${target}/${dep.name}`)) {
		print.error(`clone failed:${dep.source}`);
		print.error(cloneProcess.stderr);
		process.exit(1);
	}
}
//加载命令控制器
export default async (cmd:any) => {
	print.info('start rig preinstall');
	try {
		//读取package.rig.json5,生成配置对象
		const rigConfig = RigConfig.createFromCWD();
		//检查配置项格式是否正确
		rigConfig.validate();
		//检查依赖间的相互依赖是否有效
		rigConfig.validateDeps();
		//创建rig_dev目录用来开发rig管理下的依赖
		if (!(fs.existsSync('./rig_dev') && fs.lstatSync('./rig_dev').isDirectory())) {
			print.info('create folder rig_dev');
			fs.mkdirSync('rig_dev');
			fs.writeFileSync('rig_dev/.gitkeep', '')
		}
		shell.chmod('777', 'rig_dev');
		let target = 'rig_dev';
		let pkgJson = JSON.parse(fs.readFileSync('package.json').toString());
		let dependencies = pkgJson['dependencies'];
		/**
		 * 核心原则
		 * 1. install 不应该覆盖或删除已经clone到rig_dev下的模块，由开发者自己选择要不要删
		 * 2. rig_dev下的模块更新，由开发者自己git操作解决。
		 */
		for (let rigName in rigConfig.dependencies) {
			const dep = rigConfig.dependencies[rigName];
			if (dep.dev) {
				//不去覆盖已下载的库
				if (fs.existsSync(`${target}/${dep.name}`)) {
					print.info(`${dep.name} already exists.`);
				} else {
					clone(target, dep);
				}
			} else {
				//不是开发中状态,不处理，不去删除已下载的模块
				//预安装时在node_modules中要先清除json5里的库
				if (fs.existsSync(`node_modules/${dep.name}`)) {
					shell.rm('-rf', `node_modules/${dep.name}`);
				}
				if (fs.existsSync(`node_modules/.yarn-integrity`)) {
					shell.rm('-rf', `node_modules/.yarn-integrity`);
				}
			}
			dependencies[dep.name] = `git+ssh://${dep.source}#${dep.version}`
		}
		//覆盖package.json
		pkgJson.dependencies = dependencies;
		fs.writeFileSync('package.json', JSON.stringify(pkgJson, null, 2));
		//收尾
		print.succeed(`preinstall SUCCEED! Will do "yarn install"`);
		//远程链接设置完成，开发库设置完成，准备执行yarn install
	} catch (e) {
		print.error(e.message);
		process.exit(1);
	}
}
