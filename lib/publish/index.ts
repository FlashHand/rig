import fsHelper from '../utils/fsHelper';
import CICD from '@/classes/cicd/CICD';
import CICDCmd from '@/classes/cicd/CICDCmd';
import shell from 'shelljs';
import path from 'path';
import CDN from '@/classes/cicd/Deploy/CDN';

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
  //create cicd object
  const cicd = CICD.createByDefault(cmd);
  //construct cmd object
  const cicdCmd = new CICDCmd(cmd, cicd);

  console.log('Start Publish-----');
  const target = Array.isArray(cicdCmd.cicd.target)
    ? cicdCmd.cicd.target[0]
    : cicdCmd.cicd.target;

  const cdn = new CDN(target);
  const urls: string[] = [];
  for (const endpoint of cicdCmd.endpoints) {
    // 目前只支持set一个original
    await setRWriteUri(
      endpoint.domain,
      `/${target.uri_rewrite.original}`,
      `/${endpoint.deployDir.replace(/\\/g, '/')}/index.html`,
      cdn
    );
    urls.push(`https://${endpoint.domain}/${target.uri_rewrite.original}`);
  }

  //刷新cdn
  await refreshCache(urls, cdn);
  console.log('Publish Done-----');
};
