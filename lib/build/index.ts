import CICD, {Define, FrameworkType} from '@/classes/cicd/CICD';
import CICDCmd from '@/classes/cicd/CICDCmd';
import shell from 'shelljs';
import path from 'path';
import fs from 'fs';
import vueEnv from '../vue-env';
const print = require('../print');

const replaceDefine = (target: string, defines?: Define) => {
	console.log(`start replaceDefine:${target}`);
	const dirs = fs.readdirSync(target);
	for (let dir of dirs) {
		const stat = fs.statSync(path.join(target, dir));
		if (stat.isDirectory()) {
			replaceDefine(path.join(target, dir), defines);
		} else {
			if (defines) {
				const namePieces = dir.split('.');
				const fileType = namePieces[namePieces.length - 1];
				if (['js', 'ts', 'html'].indexOf(fileType) >= 0) {
					let file = fs.readFileSync(path.join(target, dir)).toString();
					const replaceArr = Object.keys(defines);
					for (let replace of replaceArr) {
						file = file.replace(new RegExp(replace, 'g'), defines[replace] as string);
					}
					fs.writeFileSync(path.join(target, dir), file);
				}
			}
		}
	}
}
export default async (cmd: any) => {
	try {
		console.log('start building');
		//create cicd object
		const cicd = CICD.createByDefault(cmd);
		//construct cmd object
		const cicdCmd = new CICDCmd(cmd, cicd);
		//build by cicdCmd and cicdConfig
		if (cicdCmd.endpoints.length === 0) {
			throw new Error('Must have validate endpoints')
		}
		//替换build中的可替换变量
		const regexPublicPath = new RegExp('\\$public_path', 'g');
		const regexPublicPath2 = new RegExp('__PUBLIC_PATH__', 'g');
		const regexDomain = new RegExp('__DOMAIN__', 'g');

		for (let i = 0; i < cicdCmd.endpoints.length; i++) {
			const ep = cicdCmd.endpoints[i];
			try {
				//替换define中的$public_path
				if (ep.defines){
					Object.keys(ep.defines).forEach(key => {
						ep.defines[key] = ep.defines[key].replace(regexPublicPath, ep.publicPath);
						ep.defines[key] = ep.defines[key].replace(regexPublicPath2, ep.publicPath);
						ep.defines[key] = ep.defines[key].replace(regexDomain, ep.domains[0]);
					});
				}
			} catch (e) {
				console.log('JSON5 error:', ep.defines, e.message);
			}
			let frameworktype: FrameworkType | undefined;
			//判断是否要生成环境变量文件,以及生成环境变量的操作
			if (ep.vue_env) {
				frameworktype = FrameworkType.vue;
			}
			if (!ep.extra_env) ep.extra_env = {};
			ep.extra_env['PUBLIC_PATH'] = ep.publicPath;
			ep.extra_env['OUTPUT_DIR'] = path.join(cicd.source.root_path, ep.publicPath);

			switch (frameworktype) {
				case FrameworkType.vue: {
					vueEnv.useEnv(ep.vue_env!, ep.extra_env);
					//推测vue脚本
					if (!ep.build) ep.build = `npx vue-cli-service build --mode rig --dest ${ep.extra_env['OUTPUT_DIR']}`;
				}
					break;
				default:
					break;
			}
			ep.build = ep.build.replace(regexPublicPath, ep.publicPath);
			print.info(`using build script:${ep.build}`);
			shell.exec(ep.build);
			//setup default defines and replace text in built source.
			if (!ep.defines) ep.defines = {};
			ep.defines['__PUBLIC_PATH__'] = ep.publicPath;
			ep.defines['__DEPLOY_DIR__'] = ep.publicPath;
			ep.defines['__RIG_PUBLIC_PATH__'] = ep.publicPath;
			ep.defines['__RIG_DEPLOY_DIR__'] = ep.publicPath;
			replaceDefine(path.join(cicd.source.root_path, ep.publicPath), ep.defines);
		}
	} catch (e) {
		console.error(e.message);
		process.exit(1);
	}
}
