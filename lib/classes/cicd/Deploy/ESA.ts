import ESAClient, {
  ListSitesRequest,
  CreateRewriteUrlRuleRequest,
  PurgeCachesRequest,
  PurgeCachesRequestContent,
} from '@alicloud/esa20240910';
import { $OpenApiUtil } from '@alicloud/openapi-core';
import { DeployTarget } from '../CICD';

/**
 * ESA (Aliyun Edge Security Acceleration) deploy adapter — the ESA-flavoured
 * counterpart of {@link ./CDN.ts}. Used by `rig publish` when the deploy target
 * sets `edge_provider: 'esa'`.
 *
 * Differences from traditional CDN:
 * - ESA config is **site-scoped**: every operation needs a numeric `siteId`,
 *   resolved from the registrable zone (e.g. `terncloud.com`) via `ListSites`.
 * - Back-to-origin rewrite uses `CreateRewriteUrlRule` (rule expression +
 *   static/dynamic target URI), not CDN's regex `back_to_origin_url_rewrite`.
 * - Cache refresh uses `PurgeCaches`, not `RefreshObjectCaches`.
 *
 * Credentials come from the DeployTarget (injected via `-p ak=...&as=...`),
 * never hard-coded here.
 */
class ESA {
  private client: ESAClient;
  private siteIdCache: Map<string, number> = new Map();
  private explicitSiteName?: string;

  constructor(target: DeployTarget) {
    const config = new $OpenApiUtil.Config({
      accessKeyId: target.access_key,
      accessKeySecret: target.access_secret,
      endpoint: target.esa_endpoint || 'esa.cn-hangzhou.aliyuncs.com',
    });
    this.client = new ESAClient(config);
    this.explicitSiteName = target.esa_site_name;
  }

  /**
   * Registrable zone for a domain: `test-esa.terncloud.com` -> `terncloud.com`.
   * (Good enough for normal `*.com` / `*.cn` zones; pass `esa_site_name`
   * explicitly for multi-label public suffixes like `*.com.cn`.)
   */
  private siteNameFor(domain: string): string {
    if (this.explicitSiteName) return this.explicitSiteName;
    const parts = domain.split('.').filter(Boolean);
    return parts.length <= 2 ? domain : parts.slice(-2).join('.');
  }

  /** Resolve (and cache) the numeric ESA siteId for a domain's zone. */
  public async resolveSiteId(domain: string): Promise<number> {
    const siteName = this.siteNameFor(domain);
    const cached = this.siteIdCache.get(siteName);
    if (cached) return cached;

    const resp = await this.client.listSites(
      new ListSitesRequest({ siteName, siteSearchType: 'exact' })
    );
    const sites = resp.body?.sites || [];
    const site = sites.find((s) => s.siteName === siteName) || sites[0];
    if (!site || site.siteId == null) {
      throw new Error(
        `ESA site not found for "${siteName}" (domain ${domain}). ` +
          `Create the ESA site (zone) and bind the OSS origin in the ESA console/API first.`
      );
    }
    this.siteIdCache.set(siteName, site.siteId);
    return site.siteId;
  }

  /**
   * Create a single back-to-origin URI rewrite rule.
   * @param rule ESA rule expression. `true` matches all requests; otherwise a
   *   conditional expression, e.g. `(http.request.uri.path.file_name ne "")`.
   * @param rewriteUriType `static` (fixed `uri`) or `dynamic` (`uri` is an expression).
   * @param uri target URI after rewrite (static path or dynamic expression).
   * @param sequence rule priority (lower runs first).
   */
  public async setRewriteRule(
    domain: string,
    ruleName: string,
    rule: string,
    rewriteUriType: 'static' | 'dynamic',
    uri: string,
    sequence: number
  ) {
    const siteId = await this.resolveSiteId(domain);
    const resp = await this.client.createRewriteUrlRule(
      new CreateRewriteUrlRuleRequest({
        siteId,
        ruleName,
        rule,
        ruleEnable: 'on',
        rewriteUriType,
        uri,
        sequence,
      })
    );
    return resp.body;
  }

  /** Purge cached files by URL. */
  public async purgeCache(domain: string, urls: string[]) {
    const siteId = await this.resolveSiteId(domain);
    const resp = await this.client.purgeCaches(
      new PurgeCachesRequest({
        siteId,
        type: 'file',
        content: new PurgeCachesRequestContent({ files: urls }),
      })
    );
    return resp.body;
  }
}

export default ESA;
