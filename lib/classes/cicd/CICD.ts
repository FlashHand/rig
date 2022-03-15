import DirLevel from '@/classes/cicd/DirLevel';
import Endpoint, { EndpointDict} from '@/classes/cicd/Endpoint';

import {Dir} from 'fs';

export enum CloudType {
	alicloud = 'alicloud',
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
interface DeployTarget {
	id: string;
	type: CloudType;
	bucket: string;
	access_key: string;
	access_secret: string;
	root_path: '/';
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
 */
export interface CICDConfig {
	tree_schema: string;
	source: DeploySource;
	target: DeployTarget | DeployTarget[];
	defines: DefineDict;
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
	defines: DefineDict;
	groups: DirGroup[];

	constructor(config: CICDConfig) {
		this.treeSchema = config.tree_schema;
		this.schema = DirLevel.createSchema(this.treeSchema);
		this.endpoints = Endpoint.createEndpointArr(config,this.schema);
		this.defines = config.defines;
		this.source = config.source;
		this.target = config.target;
		this.groups = config.groups;
	}

	matchEndpoints(cmdDirStrArr: string[]) {
	}
}

export default CICD;
