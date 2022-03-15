import fsHelper from '../utils/fsHelper';
import CICD from '@/classes/cicd/CICD';
import CICDCmd from '@/classes/cicd/CICDCmd';
import shell from 'shelljs';

export default async (cmd: any) => {
	const cicdConfigJson = fsHelper.readCICDConfig();
	const cicdConfig = new CICD(cicdConfigJson);
	const args: string[] = cmd.args;
	//construct cmd object
	const cicdCmd = new CICDCmd(cmd, cicdConfig);
	//build by cicdCmd and cicdConfig
	for (let i = 0; i < cicdCmd.endpoints.length; i++) {
		const ep = cicdCmd.endpoints[i];
		shell.exec(ep.build);
	}
}
