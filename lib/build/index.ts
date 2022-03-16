import fsHelper from '../utils/fsHelper';
import CICD from '@/classes/cicd/CICD';
import CICDCmd from '@/classes/cicd/CICDCmd';
import shell from 'shelljs';

export default async (cmd: any) => {
	//create cicd object
	const cicd = CICD.createByDefault(cmd);
	//construct cmd object
	const cicdCmd = new CICDCmd(cmd, cicd);
	console.log(cicd)
	//build by cicdCmd and cicdConfig
	console.log(cicdCmd.endpoints);
	for (let i = 0; i < cicdCmd.endpoints.length; i++) {
		const ep = cicdCmd.endpoints[i];
		const cmdStr = `cross-env PUBLIC_PATH=${ep.deployDir} ${ep.build}`;
		console.log(cmdStr);
		shell.exec(cmdStr);
	}
}
