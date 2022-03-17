import moment from 'dayjs';
import qs from 'qs';
import crypto from 'crypto';
import axios from 'axios';
import * as uuid from 'uuid';
import { DeployTarget } from '../CICD';

type TFlag = 'break' | 'enhance_break' | null;

class CDN {
  AccessKeySecret: string;
  AccessKeyId: string;
  constructor(target: DeployTarget) {
    this.AccessKeyId = target.access_key;
    this.AccessKeySecret = target.access_secret;
  }
  /**
   * 访问CDN通用接口
   * @param {接口名称} actionName
   * @param {各接口定制化参数} paramObj
   * @returns
   */
  private async getCdnData(actionName: string, paramObj: Object) {
    let config = {
      Action: actionName,
      Format: 'JSON',
      Version: '2018-05-10',
      AccessKeyId: this.AccessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: moment().toDate().toISOString(),
      SignatureVersion: '1.0',
      SignatureNonce: uuid.v1(),
    };
    config = Object.assign(config, paramObj);
    let paramConfig = qs.stringify(config, {
      sort: (a: any, b: any) => {
        return a < b ? -1 : 1;
      },
      charset: 'utf-8',
    });

    const strSign = `GET&%2F&${encodeURIComponent(paramConfig)}`;
    // console.log(`strSign: ${strSign}\n`);
    const hmacSha1 = crypto.createHmac('sha1', `${this.AccessKeySecret}&`);
    hmacSha1.update(strSign);
    const signature = hmacSha1.digest('base64');
    paramConfig += `&Signature=${signature}`;

    const url = `http://cdn.aliyuncs.com?${paramConfig}`;

    const res = await axios.create().get(url);
    return res.data;
  }

  /**
   * 改写回源URI接口
   * @param {加速域名} domainName
   * @param {需要重写的url 数组} sourceUrls
   * @param {重写目标url 数组} targetUrls
   * @param {改写操作执行规则 数组 值为null、break或enhance_break} flags
   * @returns
   */
  public async setRWriteUri(
    domainName: string,
    sourceUrls: string[],
    targetUrls: string[],
    flags: TFlag[]
  ) {
    try {
      if (sourceUrls.length !== targetUrls.length) {
        throw new Error(`sourceUrls's length not equal targetUrls's length`);
      }
      const Functions: Object[] = [];
      sourceUrls.forEach((item, index) => {
        Functions.push({
          functionArgs: [
            {
              argName: 'source_url',
              argValue: item,
            },
            {
              argName: 'target_url',
              argValue: targetUrls[index],
            },
            {
              argName: 'flag',
              argValue: flags[index],
            },
          ],
          functionName: 'back_to_origin_url_rewrite',
        });
      });

      const data = await this.getCdnData('BatchSetCdnDomainConfig', {
        DomainNames: domainName,
        Functions: JSON.stringify(Functions),
      });
      return data;
    } catch (e) {
      console.error(`Error: ${e.response ? JSON.stringify(e.response.data.Message) : e}`);
      throw new Error(e);
    }
  }

  /**
   * 刷新节点上的文件内容
   * @param {刷新URL, 格式为加速域名或刷新的文件或目录。多个URL之间使用换行符(\n)或(\r\n)分隔} objectPath
   * @param {刷新的类型 File: 文件; Directory: 目录} objectType
   */
  public async refreshCache(objectPath: string, objectType: string) {
    const data = await this.getCdnData('RefreshObjectCaches', {
      ObjectPath: objectPath,
      ObjectType: objectType ? objectType : undefined,
    });
    return data;
  }

  /**
   * 预热源站内容到缓存节点
   * @param {预热URL,格式为加速域名或预热的文件 多个URL之间使用换行符(\n)或(\r\n)分隔 单条长度最长为1024个字符} objectPath
   * @returns
   */
  async pushCache(objectPath: string) {
    const data = await this.getCdnData('PushObjectCache', {
      ObjectPath: objectPath,
    });
    return data;
  }
}

export default CDN;
