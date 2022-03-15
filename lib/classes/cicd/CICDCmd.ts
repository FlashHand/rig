import Endpoint from '@/classes/cicd/Endpoint';
import CICD from '@/classes/cicd/CICD';
import qs, {ParsedUrlQuery} from 'querystring';

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
	dirSchemaStrArr: string[];
	dirStrArr: string[];
	endpoints: Endpoint[] = [];
	cicd: CICD;

	constructor(cmd: any, cicd: CICD) {
		const cmdArgs = cmd.args;
		this.dir = cmdArgs[0];
		const paramKeys = this.dir.match(/(?<=\{)[a-zA-Z]+(?=\})/g) || [];
		let params: ParsedUrlQuery = qs.parse(cmd.params);
		for (let key of paramKeys) {
			const val = params[key];
			if (val) {
				this.dir = this.dir.replace(`{${key}}`, val as string);
			} else {
				throw new Error(`${key} is not set`);
			}
		}
		this.dirStrArr = this.dir.split('/').filter((dirStr, index) => dirStr.length > 0);
		this.dirSchemaStrArr = this.dir.split('/').filter((dirStr, index) => dirStr.length > 0 && index < cicd.schema.length);
		if (this.dirStrArr.length > this.dirSchemaStrArr.length) {

		}
		this.cicd = cicd;
		this.createTargetEndpoints();
	}

	private createTargetEndpoints() {
		const allEndpints = this.cicd.endpoints;
		this.endpoints = allEndpints.filter(endpoint => endpoint.matchCmd(this.dirSchemaStrArr, this.cicd.groups));
	}
}

export default CICDCmd;
