import fs from "fs";
import path from "path";
import CICD from "@/classes/cicd/CICD";
import CICDCmd from "@/classes/cicd/CICDCmd";
import AliOSS from "@/classes/cicd/Deploy/AliDeploy";
import CDN from "@/classes/cicd/Deploy/CDN";

let filesList: string[] = [];
const traverseFolder = (url: string) => {
  if (fs.existsSync(url)) {
    const files = fs.readdirSync(url);
    files.forEach((file) => {
      const curPath = path.join(url, file);
      if (fs.statSync(curPath).isDirectory()) {
        traverseFolder(curPath);
      } else {
        filesList.push(curPath);
      }
    });
  }
};

export default async (cmd: any) => {
  try {
    //create cicd object
    const cicd = CICD.createByDefault(cmd);
    //construct cmd object
    const cicdCmd = new CICDCmd(cmd, cicd);

    const target = Array.isArray(cicdCmd.cicd.target)
      ? cicdCmd.cicd.target[0]
      : cicdCmd.cicd.target;

    const aliOss = new AliOSS(target.access_key, target.access_secret, target.region, target.bucket);
    const cdn = new CDN(target.access_key, target.access_secret);
    for (let i = 0; i < cicdCmd.endpoints.length; i++) {
      const distPath = path.join(
        process.cwd(),
        cicd.source.root_path,
        cicdCmd.endpoints[i].dir
      );
      traverseFolder(distPath);
      await aliOss.putStreamFiles(
        filesList,
        cicdCmd.endpoints[i].deployDir.replace(/\\/g, "/"),
        cicdCmd.endpoints[i].dir
      );

    //   await cdn.setRWriteUri(
    //     cicdCmd.endpoints[i].domain,
    //     [""],
    //     [""],
    //     ["break"]
    //   );
      filesList = [];
    }
  } catch (e) {
    throw e;
  }
};
