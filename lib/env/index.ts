/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2021/11/18 6:14 PM
 */
import * as fs from 'fs';
import json5 from 'json5';
import print from "../print";
import * as console from "console";
const useEnv =  (mode:string,extra?:any)=>{
	try {
		const rigJson5 = json5.parse(fs.readFileSync('env.rig.json5'));
		let modeObj = rigJson5[mode];
		if (modeObj) {
			if (extra) modeObj = Object.assign(modeObj, extra);
			const keysArray = Object.keys(modeObj);
			let content = "";
			content += 'MODE' + " = " + mode + "\n"
			content += 'VITE_MODE' + " = " + mode + "\n"
			for (let i = 0; i<keysArray.length; i++) {
				const key = keysArray[i];
				const value = modeObj[key];
				content += key + " = " + value + "\n"
			}

			print.info(`using env:`)
			console.log(`----------${mode}----------`)
			console.log(content);
			console.log(`----------${mode}----------`)
			fs.writeFileSync('./.env.rig', content, {flag: "w"});
		} else {
			print.error("请先在env.rig.json5文件中配置" + mode + "模式的环境变量");
			process.exit(1)
		}
	} catch (e) {
		print.error(e.message);
		process.exit(1)
	}
}
//加载命令控制器
const load = async () => {
	try {
		const mode = process.argv[process.argv.length -1];
		useEnv(mode);
	} catch (e) {
		print.error(e.message);
		process.exit(1)
	}
}

export default {
	load,
	useEnv
}
