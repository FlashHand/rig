import fsHelper from '../utils/fsHelper';
import CICD, {Define} from '@/classes/cicd/CICD';
import CICDCmd from '@/classes/cicd/CICDCmd';
import fs from 'fs';
import path from 'path';
import {cat} from 'shelljs';
const replaceDefine = (target:string,define?:Define)=>{
	const dirs = fs.readdirSync(target);
	for (let dir of dirs){
		const stat = fs.statSync(path.join(target, dir));
		if (stat.isDirectory()){
			replaceDefine(path.join(target, dir),define);
		}else{
			if (define){
				const namePieces = dir.split('.');
				const fileType = namePieces[namePieces.length - 1];
				if (['js','json','json5','yml','ts'].indexOf(fileType)>=0){
					let file = fs.readFileSync(path.join(target, dir)).toString();
					const replaceArr = Object.keys(define);
					for (let replace of replaceArr){
						file = file.replace(new RegExp(replace,'g'),define[replace] as string);
					}
					fs.writeFileSync(path.join(target, dir),file);
				}
			}
		}
	}
}
export default async (cmd: any) => {
	let phase = 'start define';
	try{
		const cicdConfigJson = fsHelper.readCICDConfig();
		const cicdConfig = new CICD(cicdConfigJson);
		const args: string[] = cmd.args;
		const define = cicdConfig.defines[args[1]];
		//construct cmd object
		const cicdCmd = new CICDCmd(cmd, cicdConfig);
		//define by cicdCmd and cicdConfig
		phase = 'start replacement';
		for (let i = 0; i < cicdCmd.endpoints.length; i++) {
			const ep = cicdCmd.endpoints[i];
			replaceDefine(path.join(cicdConfig.source.root_path, ep.dir),define);
		}
	}catch (e) {
		throw new Error(`${phase}:${e.message}`)
	}
}
