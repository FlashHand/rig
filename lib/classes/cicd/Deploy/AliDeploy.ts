import aliOSS from "ali-oss";
import fs from "fs";
class AliOSS {
  ossClient: aliOSS;
  constructor(accessKeyId: string, accessKeySecret: string) {
    this.ossClient = new aliOSS({
      region: "oss-cn-hangzhou",
      accessKeyId: accessKeyId,
      accessKeySecret: accessKeySecret,
      bucket: "rys-deploy",
      timeout: 600000,
    });
  }

  private async progress(p: number, filePath: string, ossPath: string) {
    // 上传进度。
    process.stdout.clearLine(-1);
    process.stdout.cursorTo(0);
    process.stdout.write(
      `progress: ${p.toFixed(2)}%, Upload '${filePath}' To OSS_PATH:${ossPath}`
    );
  }

  public async putStreamFiles(filesList: string[], ossBasePath: string, dir: string) {
    for (let i = 0; i < filesList.length; i++) {
      const filePath = filesList[i].split("dist\\")[1];
      const ossPath = ossBasePath + filePath.replace(/\\/g, "/").replace(dir, '');
      const fileResult = await this.ossClient.putStream(
        ossPath,
        fs.createReadStream(filesList[i])
      );
      if (fileResult.res.status === 200) {
        const p = ((i + 1) * 100) / filesList.length;
        this.progress(p, filesList[i], ossPath);
      }
    }
    console.log("\n");
  }
}

export default AliOSS;
