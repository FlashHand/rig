import fsHelper from '../utils/fsHelper';
import CICD, {Define} from '@/classes/cicd/CICD';
import CICDCmd from '@/classes/cicd/CICDCmd';
import shell from 'shelljs';
import path from 'path';
import fs from 'fs';
const replaceDefine = (target:string,defines?:Define)=>{
	const dirs = fs.readdirSync(target);
	for (let dir of dirs){
		const stat = fs.statSync(path.join(target, dir));
		if (stat.isDirectory()){
			replaceDefine(path.join(target, dir),defines);
		}else{
			if (defines){
				const namePieces = dir.split('.');
				const fileType = namePieces[namePieces.length - 1];
				if (['js','ts'].indexOf(fileType)>=0){
					let file = fs.readFileSync(path.join(target, dir)).toString();
					const replaceArr = Object.keys(defines);
					for (let replace of replaceArr){
						file = file.replace(new RegExp(replace,'g'),defines[replace] as string);
					}
					fs.writeFileSync(path.join(target, dir),file);
				}
			}
		}
	}
}
export default async (cmd: any) => {
	//create cicd object
	const cicd = CICD.createByDefault(cmd);
	//construct cmd object
	const cicdCmd = new CICDCmd(cmd, cicd);
	console.log(cicd)
	//build by cicdCmd and cicdConfig
	console.log(cicdCmd.endpoints);

	for (let i = 0; i < cicdCmd.endpoints.length; i++) {
		const ep = cicdCmd.endpoints[i];
		ep.build = ep.build.replace('$public_path', ep.publicPath);
		console.log('exec build:', ep.build);
		shell.exec(ep.build);
		replaceDefine(path.join(cicd.source.root_path, ep.dir), ep.defines);
	}
}
