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
  original: string | string[],
  deployDir: string | string[],
  cdn: CDN
) => {
  const rwriteResult = await cdn.setRewriteUri(
    domain,
    Array.isArray(original) ? original : [original],
    Array.isArray(deployDir) ? deployDir : [deployDir],
    ['enhance_break']
  );

  const configId = rwriteResult?.DomainConfigList.DomainConfigModel[0].ConfigId;
  for (let i = 0; i <= 200; i++) {
    const configInfo = await cdn.describeCdnDomainConfigs(domain, configId);
    const domainConfigs = configInfo.DomainConfigs.DomainConfig;
    let successCount = 0;
    for (const domainConfig of domainConfigs) {
      if (domainConfig.Status === 'success') {
        successCount++;
      } else if (domainConfig.Status === 'failed') {
        throw new Error('cdn rewrite fail');
      }
    }
    if (successCount === domainConfigs.length) {
      break;
    }
    if (i === 200) {
      throw new Error('cdn rewrite timeout 10min');
    }
    await delay(3000);
  }
};

const refreshCache = async (urls: string[], cdn: CDN) => {
  const refreshResult = await cdn.refreshCache(urls.join('\n'));
  console.log('Please Wait For RefreshCache...');
  for (let i = 0; i <= 200; i++) {
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
    if (i === 200) {
      throw new Error('refresh cache timeout 10min');
    }
    await delay(3000);
  }
  console.log('RefreshCache Done');
};

export default async (cmd: any) => {
  try {
    const rewriteConfigs: {
      [domain: string]: { original: string[]; deployDir: string[] };
    } = {};
    const setRewriteConfig = (
      domain: string,
      originalItem: string,
      deployDirItem: string
    ) => {
      if (rewriteConfigs[domain]) {
        rewriteConfigs[domain].original.push(originalItem);
        rewriteConfigs[domain].deployDir.push(deployDirItem);
      } else {
        rewriteConfigs[domain] = {
          original: [originalItem],
          deployDir: [deployDirItem],
        };
      }
    };
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
        } else if (cicd.web_type === 'history') {
          webEntryPath = '/';
        } else {
          webEntryPath = endpoint.web_entry_path
            ? endpoint.web_entry_path
            : target.web_entry_path || '/';
        }
        for (const domain of endpoint.domains) {
          if (cicd.web_type === 'mpa') {
            //mpa匹配非首页
            setRewriteConfig(
              domain,
              '^\\/([\\w-/]*\\w+)(?![^?]*\\.\\w+)',
              `/${endpoint.deployDir.replace(/\\/g, '/')}/$1.html`
            );
            //mpa匹配文件
            setRewriteConfig(
              domain,
              `^\\/([^?]*\\.[a-zA-Z0-9]+)($|\\?)`,
              `/${endpoint.deployDir.replace(/\\/g, '/')}/$1`
            );
          } else if (cicd.web_type === 'history') {
            //spa/history匹配非首页
            setRewriteConfig(
              domain,
              '^\\/([\\w-/]*\\w+)(?![^?]*\\.\\w+)',
              `/${endpoint.deployDir.replace(/\\/g, '/')}/index.html`
            );
            //spa-history匹配文件
            setRewriteConfig(
              domain,
              `^\\/([^?]*\\.[a-zA-Z0-9]+)($|\\?)`,
              `/${endpoint.deployDir.replace(/\\/g, '/')}/$1`
            );
          } else {
            //spa-hash匹配文件
            //hash模式支持一个域名支持多个网页应用的入口路径，如/,/app1,/app2,都是不同的网页应用
            //需要替换webpack中的publicPath为实际OSS的目录
            setRewriteConfig(
              domain,
              `^\\/([^?]*\\.[a-zA-Z0-9]+)($|\\?)`,
              `/$1`
            );
          }
          //首页匹配正则，hash,history,mpa三个模式通用
          setRewriteConfig(
            domain,
            `^(${webEntryPath})($|\\?|#|\\/\\?|\\/$)`,
            `/${endpoint.deployDir.replace(/\\/g, '/')}/index.html`
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
          if (cicd.web_type !== 'hash') {
            setRewriteConfig(
              domain,
              '^\\/([^?]*\\.[a-zA-Z0-9]+)($|\\?)',
              `/${endpoint.deployDir.replace(/\\/g, '/')}/$1`
            );
          } else {
            setRewriteConfig(
              domain,
              '^\\/([^?]*\\.[a-zA-Z0-9]+)($|\\?)',
              `/$1`
            );
          }
          setRewriteConfig(
            domain,
            `${
              uriRewrite.original_regexp
                ? uriRewrite.original_regexp
                : uriRewrite.original
            }`,
            `/${endpoint.deployDir.replace(/\\/g, '/')}/index.html`
          );
          urls.push(`https://${domain}${uriRewrite.original}`);
        }
      }
    }

    // 回源URI改写
    console.log('Please Wait For Set RWrite URI...');
    const setRewriteUriPromises: Promise<any>[] = [];
	console.log('rewriteConfigs: ', rewriteConfigs);
    Object.keys(rewriteConfigs).forEach((domain) => {
      const rewriteConfig = rewriteConfigs[domain];
      setRewriteUriPromises.push(
        setRewriteUri(
          domain,
          rewriteConfig.original,
          rewriteConfig.deployDir,
          cdn
        )
      );
    });
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
