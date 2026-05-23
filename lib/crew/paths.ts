import os from 'os';
import path from 'path';

export const RIG_HOME = process.env.RIG_HOME || path.join(os.homedir(), '.rig');

export const crewPaths = {
  home: RIG_HOME,
  crewDir: path.join(RIG_HOME, 'crew'),
  rolesDir: path.join(RIG_HOME, 'crew', 'roles'),
  config: path.join(RIG_HOME, 'crew.config.json'),
  state: path.join(RIG_HOME, 'crew-state.json'),
  userRules: path.join(RIG_HOME, 'RIG.md'),
};
