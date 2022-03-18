import fs from 'fs';
import path from 'path';
import CICD from '@/classes/cicd/CICD';
import CICDCmd from '@/classes/cicd/CICDCmd';
import AliOSS from '@/classes/cicd/Deploy/AliDeploy';
import CDN from '@/classes/cicd/Deploy/CDN';

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

const setRWriteUri = async (
  domain: string,
  original: string,
  deployDir: string,
  cdn: CDN
) => {
  const rwriteResult = await cdn.setRWriteUri(
    domain,
    [original],
    [deployDir],
    ['enhance_break']
  );

  const configId = rwriteResult?.DomainConfigList.DomainConfigModel[0].ConfigId;
  console.log('Please Wait For Set RWrite URI...');
  while (true) {
    const configInfo = await cdn.describeCdnDomainConfigs(domain, configId);
    if (configInfo.DomainConfigs.DomainConfig[0].Status === 'success') {
      break;
    }
    if (configInfo.DomainConfigs.DomainConfig[0].Status === 'failed') {
      throw new Error('cdn rewrite fail');
    }
  }
  console.log('Set RWrite URI Done');
};

const refreshCache = async (urls: string[], cdn: CDN) => {
  const refreshResult = await cdn.refreshCache(urls.join('\n'));
  console.log('Please Wait For RefreshCache...');
  while (true) {
    const desResult = await cdn.describeRefreshTaskById(
      refreshResult.RefreshTaskId
    );
    let successCount = 0;
    for (const item of desResult.Tasks) {
      if (item.Status === 'Complete') {
        successCount++;
      } else if (item.Status === 'Failed') {
        throw new Error('RefreshCache Failed');
      }
    }
    if (successCount === desResult.Tasks.length) {
      break;
    }
  }
  console.log('RefreshCache Done');
};

export default async (cmd: any) => {
  try {
    console.log('Start Deploy-----');
    //create cicd object
    const cicd = CICD.createByDefault(cmd);
    //construct cmd object
    const cicdCmd = new CICDCmd(cmd, cicd);

    const target = Array.isArray(cicdCmd.cicd.target)
      ? cicdCmd.cicd.target[0]
      : cicdCmd.cicd.target;

    const aliOss = new AliOSS(target);
    const cdn = new CDN(target);
    const urls: string[] = [];
    console.log('Please Wait for Upload OSS...');
    for (let i = 0; i < cicdCmd.endpoints.length; i++) {
      const distPath = path.join(
        process.cwd(),
        cicd.source.root_path,
        cicdCmd.endpoints[i].dir
      );
      traverseFolder(distPath);
      await aliOss.putStreamFiles(
        filesList,
        cicdCmd.endpoints[i].deployDir.replace(/\\/g, '/'),
        cicdCmd.endpoints[i].dir
      );

      urls.push(
        `https://${cicdCmd.endpoints[i].domain}/${target.uri_rewrite.original}`
      );
      filesList = [];
    }
    console.log('Upload OSS Done');

    // 目前只支持set一个original
    await setRWriteUri(
      cicdCmd.endpoints[0].domain,
      `/${target.uri_rewrite.original}`,
      `/${cicdCmd.endpoints[0].deployDir.replace(/\\/g, '/')}/index.html`,
      cdn
    );

    //刷新cdn
    await refreshCache(urls, cdn);
    console.log('Deploy Done-----');
  } catch (e) {
    throw e;
  }
};
