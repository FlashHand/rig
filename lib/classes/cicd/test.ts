import fs from 'fs';
const JSON5 = require('json5');

import {CICDConfig} from '@/classes/cicd/CICD';

const cicdConfig: CICDConfig = JSON5.parse(fs.readFileSync('../../../demo/cicd.rig.json5'));
console.log(cicdConfig);
