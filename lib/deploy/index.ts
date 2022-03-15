// import fs from "fs";
// import path from "path";
// import aliOSS from "ali-oss";
// import fsHelper from "../utils/fsHelper";
// import CICD from "@/classes/cicd/CICD";
// import CICDCmd from "@/classes/cicd/CICDCmd";
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
// export default async (cmd: any) => {
//   try {
//     const cicdConfigJson = fsHelper.readCICDConfig();
//     const cicdConfig = new CICD(cicdConfigJson);
//     const args: string[] = cmd.args;
//     const cicdCmd = new CICDCmd(args[0], cicdConfig);
//
//     for (let i = 0; i < cicdCmd.endpoints.length; i++) {
//       const distPath = path.join(
//         cicdConfig.source.root_path,
//         cicdCmd.endpoints[i].dir
//       );
//       traverseFolder(distPath);
//
//       for (let i = 0; i < filesList.length; i++) {
//         const filePath = filesList[i].split("dist\\")[1];
//         const ossBasePath = `${
//           Array.isArray(cicdConfig.target)
//             ? cicdConfig.target[0].root_path
//             : cicdConfig.target.root_path
//         }/`;
//         const ossPath = ossBasePath + filePath.replace(/\\/g, "/");
//         const fileResult = await ossClient.putStream(
//           ossPath,
//           fs.createReadStream(filesList[i])
//         );
//         if (fileResult.res.status === 200) {
//           const p = ((i + 1) * 100) / filesList.length;
//           progress(p, filesList[i], ossPath);
//         }
//       }
//       console.log("\n");
//       filesList = [];
//     }
//   } catch (e) {
//     console.error(e);
//   }
// };
