import DirLevel from '@/classes/cicd/DirLevel';
import Endpoint, { EndpointDict} from '@/classes/cicd/Endpoint';
import fs from 'fs';

const JSON5 = require('json5');
import qs from 'querystring';
import util from 'util';
export enum CloudType {
	alicloud = 'alicloud',
}
export enum FrameworkType {
	vue = 'vue',
}
/**
 * Bundle source
 */
interface DeploySource {
	root_path: string
}

/**
 * Deploy target
 */
export interface DeployTarget {
	id: string;
	type: CloudType;
	bucket: string;
	region: string;
	access_key: string;
	access_secret: string;
	root_path: '/';
	uri_rewrite: {
		original: string;
		original_regexp: string;
		final?: string;
	} | undefined;
}

/**
 * @interface DirGroup
 * Only dynamic Dirlevel can use DirGroup
 */
export interface DirGroup {
	name: string,
	/**
	 * Name in DirLevel,
	 */
	level: string,
	includes: string[],
}
export interface Define{
	[replace: string]: String;
}
export interface DefineDict{
	[group: string]: Define;
}

/**
 * Whole CI/CD config
 * @property tree_schema string fafafa
 */
export interface CICDConfig {
	/**
	 * fafafafa
	 */
	tree_schema: string;
	source: DeploySource;
	target: DeployTarget | DeployTarget[];
	endpoints: EndpointDict;
	groups: DirGroup[];
}


class CICD {
	/**
	 * schema of the directory tree
	 * @type {string}
	 */
	treeSchema: string;
	/**
	 * DirLevel shows every level of the directory structure
	 * @type {DirLevel[]}
	 */
	schema: DirLevel[];
	/**
	 * endpoints contains build info and deploy info.
	 * @type {Endpoint[]}
	 */
	endpoints: Endpoint[];
	source: DeploySource;
	target: DeployTarget | DeployTarget[];
	groups: DirGroup[];

	constructor(config: CICDConfig) {
		this.treeSchema = config.tree_schema;
		this.schema = DirLevel.createSchema(this.treeSchema);
		this.endpoints = Endpoint.createEndpointArr(config,this.schema);
		this.source = config.source;
		this.target = config.target;
		this.groups = config.groups;
	}
	static createByDefault(cmd:any){
		//replace params
		let cicdStr = fs.readFileSync(`${process.cwd()}/cicd.rig.json5`).toString();
		const paramsStr = cmd.params;
		const params = qs.parse(paramsStr);
		//替换动态变量
		Object.keys(params).forEach(key => {
			const regStr = `\\$\\{${key}\\}`;
			const regex = new RegExp(regStr, 'g');
			cicdStr = cicdStr.replace(regex, params[key] as string);
		});
		const cicd =  new CICD(JSON5.parse(cicdStr))
		return cicd;
	}

	matchEndpoints(cmdDirStrArr: string[]) {

	}
}

export default CICD;
