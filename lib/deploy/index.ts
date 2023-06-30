import fs from 'fs';
import path from 'path';
import CICD from '@/classes/cicd/CICD';
import CICDCmd from '@/classes/cicd/CICDCmd';
import AliOSS from '@/classes/cicd/Deploy/AliDeploy';

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
  } else {
    throw new Error(`Not Found FilePath: ${url}`);
  }
};

export default async (cmd: any) => {
  try {
    console.log('Start Deploy-----');
    //create cicd object
    const cicd = CICD.createByDefault(cmd);
    //construct cmd object
    const cicdCmd = new CICDCmd(cmd, cicd);
    console.log('cicdCmd:', cicdCmd.endpoints);

    const target = Array.isArray(cicdCmd.cicd.target)
      ? cicdCmd.cicd.target[0]
      : cicdCmd.cicd.target;
    console.log('oss tagert', target);
    const aliOss = new AliOSS(target);
    console.log('Please Wait for Upload OSS...');
    if (!cicdCmd.endpoints || cicdCmd.endpoints.length === 0) {
      throw new Error('Endpoints.length Can Not Be 0!');
    }
    for (let i = 0; i < cicdCmd.endpoints.length; i++) {
      const distPath = path.join(
        process.cwd(),
        cicd.source.root_path,
        cicdCmd.endpoints[i].deployDir
      );
      traverseFolder(distPath);
      await aliOss.putStreamFiles(filesList, cicd.source.root_path);
      filesList = [];
    }
    console.log('Upload OSS Done');
    console.log('Deploy Done-----');
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }
};
