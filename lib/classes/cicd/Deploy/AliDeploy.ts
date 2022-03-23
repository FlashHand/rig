import aliOSS from 'ali-oss';
import fs from 'fs';
import { DeployTarget } from '../CICD';
import os from 'os';

class AliOSS {
  ossClient: aliOSS;

  constructor(target: DeployTarget) {
    this.ossClient = new aliOSS({
      region: target.region,
      accessKeyId: target.access_key,
      accessKeySecret: target.access_secret,
      bucket: target.bucket,
      timeout: 600000,
    });
  }

  private async progress(p: number, filePath: string, ossPath: string) {
    // 上传进度。
    try {
      process.stdout.clearLine(1);
      process.stdout.cursorTo(0);
    } catch (e) {}
    try {
      process.stdout.write(
        `progress: ${p.toFixed(
          2
        )}%, Upload '${filePath}' To OSS_PATH:${ossPath}`
      );
    } catch (e) {}
  }

  public async putStreamFiles(
    filesList: string[],
    ossBasePath: string,
    dir: string,
    rootPath: string
  ) {
    for (let i = 0; i < filesList.length; i++) {
      let filePath = '';
      if (os.platform() === 'win32') {
        filePath = filesList[i].split(`${rootPath}\\`)[1];
      } else {
        filePath = filesList[i].split(`${rootPath}/`)[1];
      }
      const ossPath =
        ossBasePath + filePath.replace(/\\/g, '/').replace(dir, '');

      //@ts-ignore
      let options: aliOSS.PutStreamOptions = {
        contentLength: fs.statSync(filesList[i]).size,
      };
      if (filesList[i].includes('index.html')) {
        options = Object.assign({
          headers: { 'Cache-Control': 'max-age=0', Expires: -1 },
        });
      }
      const fileResult = await this.ossClient.putStream(
        ossPath,
        fs.createReadStream(filesList[i]),
        options
      );
      if (fileResult.res.status !== 200) {
        throw new Error('Upload OSS Error');
      }
      if (fileResult.res.status === 200) {
        const p = ((i + 1) * 100) / filesList.length;
        this.progress(p, filesList[i], ossPath);
      }
    }
    console.log('\n');
  }
}

export default AliOSS;
