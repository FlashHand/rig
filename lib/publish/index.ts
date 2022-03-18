import fsHelper from '../utils/fsHelper';
import CICD from '@/classes/cicd/CICD';
import CICDCmd from '@/classes/cicd/CICDCmd';
import shell from 'shelljs';
import path from 'path';

export default async (cmd: any) => {
  //create cicd object
  const cicd = CICD.createByDefault(cmd);
  //construct cmd object
  const cicdCmd = new CICDCmd(cmd, cicd);

}
