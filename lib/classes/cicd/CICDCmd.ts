import Endpoint from '@/classes/cicd/Endpoint';
import CICD, {CICDConfig} from '@/classes/cicd/CICD';
import qs, {ParsedUrlQuery} from 'querystring';
import path from 'path'
import fsHelper from '@/utils/fsHelper';
import util from 'util';

/**
 * @class CICDCmd
 * @property dir string Original specific dir in cmd.
 * @property dirArr array Splitted dir.
 * @property endpoints array Tageted endpoints used to build,define or deploy
 */
class CICDCmd {
	/**
	 * @property dir string Whole directory
	 * @type {string}
	 */
	dir: string;
	/**
	 *
	 * @type {string[]}
	 */
	dirInSchemaStrArr: string[];
	dirStrArr: string[];
	endpoints: Endpoint[] = [];
	cicd: CICD;

	constructor(cmd: any, cicd: CICD) {
		const cmdArgs = cmd.args;
		console.log('build command:', cmdArgs[0]);
		this.dir = cmdArgs[0];
		//获取需要被设置的schema变量
		const schemaKeys = this.dir.match(/(?<=\{)[a-zA-Z]+(?=\})/g) || [];
		//解析schema变量
		let schema: ParsedUrlQuery = qs.parse(cmd.schema);
		for (let key of schemaKeys) {
			const val = schema[key];
			if (val) {
				this.dir = this.dir.replace(`{${key}}`, val as string);
			} else {
				throw new Error(`${key} is not set`);
			}
		}
		//whole user's target dir
		this.dirStrArr = this.dir.split('/').filter((dirStr, index) => dirStr.length > 0);
		//dir within the schema
		this.dirInSchemaStrArr = this.dir.split('/').filter((dirStr, index) => dirStr.length > 0 && index < cicd.schema.length);
		this.cicd = cicd;
		this.createTargetEndpoints();
		console.log(util.inspect(this.endpoints, false, null, true))
	}

	private createTargetEndpoints() {
		const allEndpints = this.cicd.endpoints;
		this.endpoints = allEndpints.filter(endpoint => endpoint.matchCmd(this.dirInSchemaStrArr, this.cicd.groups));
		if (this.dirStrArr.length > this.dirInSchemaStrArr.length) {
			const sufDir = this.dirStrArr.slice(this.dirInSchemaStrArr.length, this.dirStrArr.length).join('/');
			this.endpoints = this.endpoints.map(ep => {
				//TODO:需要重构
				ep.deployDir = path.join(ep.deployDir, sufDir);
				ep.publicPath = ep.deployDir;
				return ep;
			});
		}

	}
}

export default CICDCmd;
