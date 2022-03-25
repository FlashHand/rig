import CICD from '@/classes/cicd/CICD';
import CICDCmd from '@/classes/cicd/CICDCmd';
import CDN from '@/classes/cicd/Deploy/CDN';

const setRewriteUri = async (
  domain: string,
  original: string,
  deployDir: string,
  cdn: CDN
) => {
  const rwriteResult = await cdn.setRewriteUri(
    domain,
    [original],
    [deployDir],
    [null]
  );

  const configId = rwriteResult?.DomainConfigList.DomainConfigModel[0].ConfigId;
  while (true) {
    const configInfo = await cdn.describeCdnDomainConfigs(domain, configId);
    if (configInfo.DomainConfigs.DomainConfig[0].Status === 'success') {
      break;
    }
    if (configInfo.DomainConfigs.DomainConfig[0].Status === 'failed') {
      throw new Error('cdn rewrite fail');
    }
  }
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
    const setRewriteUriPromises: Promise<any>[] = [];
    if (!cicdCmd.endpoints || cicdCmd.endpoints.length === 0) {
      throw new Error('Endpoints.length Can Not Be 0!');
    }
    for (const endpoint of cicdCmd.endpoints) {
      const uriRewrite = endpoint.uri_rewrite
        ? endpoint.uri_rewrite
        : target.uri_rewrite;

      for (const domain of endpoint.domains) {
        setRewriteUriPromises.push(
          setRewriteUri(
            domain,
            `${
              uriRewrite.original_regexp
                ? uriRewrite.original_regexp
                : uriRewrite.original
            }`,
            `/${endpoint.deployDir.replace(/\\/g, '/')}/index.html`,
            cdn
          )
        );
        urls.push(`https://${domain}${uriRewrite.original}`);
      }
    }

    // 回源URI改写
    console.log('Please Wait For Set RWrite URI...');
    await Promise.all(setRewriteUriPromises);
    console.log('Set RWrite URI Done');

    //刷新cdn
    await refreshCache(urls, cdn);
    console.log('Publish Done-----');
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }
};
