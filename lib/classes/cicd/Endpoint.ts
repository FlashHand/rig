import { CICDConfig, Define, DefineDict, DeployTarget, DirGroup } from './CICD';
import { mkdirSync } from 'fs';
import DirLevel from '@/classes/cicd/DirLevel';

interface EndpointInfo {
  build: string;
  target: string;
  domain: string;
  defines: Define;
  uri_rewrite: {
    original: string;
    original_regexp: string;
    final?: string;
  };
}

export interface EndpointDict {
  [dir: string]: EndpointInfo;
}

class Endpoint {
  dir: string;
  dirStrArr: string[];
  dirArr: DirLevel[];
  target: string;
  build: string;
  domain: string;
  deployDir: string = '';

	publicPath: string = '';
	defines: Define;
	uri_rewrite: {
		original: string,
		original_regexp: string;
		final?: string;
	} | undefined ;

  static createEndpointArr(cicdConfig: CICDConfig, schema: DirLevel[]) {
    const endpointDict = cicdConfig.endpoints;
    return Object.keys(endpointDict).map((dir) => {
      const info = endpointDict[dir];
      return new Endpoint(dir, info, schema);
    });
  }
	constructor(dir: string, info: EndpointInfo, schema: DirLevel[]) {
		this.dir = dir;
		this.deployDir = dir;
		this.publicPath = dir;
		this.dirStrArr = dir.split('/').filter(d => d.length > 0);
		this.dirArr = DirLevel.createDirArr(dir, schema);
		this.target = info.target;
		this.build = info.build;
		this.domain = info.domain;
		this.defines = info.defines;
		this.uri_rewrite = info.uri_rewrite;
	}

  matchCmd(dirSchemaStrArr: string[], groups: DirGroup[]) {
    if (this.dirStrArr.length < dirSchemaStrArr.length) {
      return false;
    }
    for (let i = 0; i < dirSchemaStrArr.length; i++) {
      const cmdDir = dirSchemaStrArr[i];
      const dir = this.dirStrArr[i];
      const dirLevel = this.dirArr[i];
      //check if dir is wildcard
      if (cmdDir !== '%') {
        //not wildcard
        //check if dir is group alias
        if (cmdDir.indexOf('%') === 0) {
          //dir is group
          //find group
          const group = groups.find((g) => g.name === cmdDir);
          if (group) {
            //group found
            //check if group includes this dir
            if (group.includes.indexOf(dir) < 0) {
              //not include
              return false;
            }
          } else {
            return false;
          }
        } else {
          //cmdDir is not group
          if (cmdDir !== dir) {
            return false;
          }
        }
      } else {
        if (!dirLevel.dynamic) return false;
      }
    }
    return true;
  }
}

export default Endpoint;
