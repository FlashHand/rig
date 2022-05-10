import CICD from '@/classes/cicd/CICD';
import CICDCmd from '@/classes/cicd/CICDCmd';
import CDN from '@/classes/cicd/Deploy/CDN';

const delay = async (ms: number) => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

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
    ['enhance_break']
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
    await delay(3000);
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
    await delay(3000);
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
      if (
        !endpoint.uri_rewrite &&
        (!target.uri_rewrite ||
          !target.uri_rewrite.original ||
          !target.uri_rewrite.original_regexp)
      ) {
        let webEntryPath: string;
        if (cicd.web_type === 'mpa') {
          webEntryPath = '/';
        } else if (cicd.web_type === 'history'){
          webEntryPath = '/';
        } else {
          webEntryPath = endpoint.web_entry_path
            ? endpoint.web_entry_path
            : target.web_entry_path || '/';
        }
        for (const domain of endpoint.domains) {
          if (cicd.web_type === 'mpa') {
            //mpa匹配文件
            setRewriteUriPromises.push(
              setRewriteUri(
                domain,
                '^\\/([^?]*\\.[a-zA-Z0-9]+)($|\\?)',
                `/${endpoint.deployDir.replace(/\\/g, '/')}/$1`,
                cdn
              )
            );
            //mpa匹配非首页
            setRewriteUriPromises.push(
              setRewriteUri(
                domain,
                '^\\/([\\w-/]*\\w+)(?![^?]*\\.\\w+)',
                `/${endpoint.deployDir.replace(/\\/g, '/')}/$1.html`,
                cdn
              )
            );
          } else if (cicd.web_type === 'history'){
            //spa/history匹配非首页
            setRewriteUriPromises.push(
              setRewriteUri(
                domain,
                '^\\/([\\w-/]*\\w+)(?![^?]*\\.\\w+)',
                `/${endpoint.deployDir.replace(/\\/g, '/')}/index.html`,
                cdn
              )
            );
            //spa/history匹配文件
            setRewriteUriPromises.push(
              setRewriteUri(
                domain,
                '^\\/([^?]*\\.[a-zA-Z0-9]+)($|\\?)',
                `/${endpoint.deployDir.replace(/\\/g, '/')}/$1`,
                cdn
              )
            );
          }else if (cicd.web_type === 'hash') {
            //hash模式匹配文件
            setRewriteUriPromises.push(
              setRewriteUri(
                domain,
                '^\\/([^?]*\\.[a-zA-Z0-9]+)($|\\?)',
                `/$1`,
                cdn
              )
            );
          }
          //首页匹配正则，hash,history,mpa三个模式通用
          setRewriteUriPromises.push(
            setRewriteUri(
              domain,
              `^(${webEntryPath})($|\\?|#|\\/\\?|\\/$)`,
              `/${endpoint.deployDir.replace(/\\/g, '/')}/index.html`,
              cdn
            )
          );
          urls.push(`https://${domain}${webEntryPath}`);
        }
      } else {
        const uriRewrite = endpoint.uri_rewrite
          ? endpoint.uri_rewrite
          : target.uri_rewrite;

        if (!uriRewrite) {
          continue;
        }

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
    }

    // 回源URI改写
    console.log('Please Wait For Set RWrite URI...');
    if (setRewriteUriPromises.length > 0) {
      await Promise.all(setRewriteUriPromises);
    } else {
      console.log('Not Have To Set RWrite URI');
    }
    console.log('Set RWrite URI Done');

    //刷新cdn
    if (urls.length > 0) {
      await refreshCache(urls, cdn);
    } else {
      console.log('Not Have To RefreshCache');
    }
    console.log('Publish Done-----');
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }
};
