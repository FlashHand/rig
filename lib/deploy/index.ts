import fs from "fs";
import path from "path";
import aliOSS from "ali-oss";
import fsHelper from "../utils/fsHelper";
import CICD from "@/classes/cicd/CICD";
import CICDCmd from "@/classes/cicd/CICDCmd";
//
// const progress = (p: number, filePath: string, ossPath: string) => {
//   // 上传进度。
//   process.stdout.clearLine(-1);
//   process.stdout.cursorTo(0);
//   process.stdout.write(
//     `progress: ${p.toFixed(2)}%, Upload '${filePath}' To OSS_PATH:${ossPath}`
//   );
// };
//
// let filesList: string[] = [];
// const traverseFolder = (url: string) => {
//   if (fs.existsSync(url)) {
//     const files = fs.readdirSync(url);
//     files.forEach((file) => {
//       const curPath = path.join(url, file);
//       if (fs.statSync(curPath).isDirectory()) {
//         traverseFolder(curPath);
//       } else {
//         filesList.push(curPath);
//       }
//     });
//   }
// };
//
export default async (cmd: any) => {
	try {
		//create cicd object
		const cicd = CICD.createByDefault(cmd);
		//construct cmd object
		const cicdCmd = new CICDCmd(cmd, cicd);
	}catch (e) {
		throw e;
	}
}
