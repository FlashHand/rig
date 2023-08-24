/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/14 6:59 PM
 */
const fs = require('fs');
const json5 = require('json5');
const print = require('../print');

const load = async () => {
  print.info('start checking for production');
  try {
    let rigJson5Str = fs.readFileSync('package.rig.json5');
    let rigJson5 = json5.parse(rigJson5Str);
    let hasErr = false;
    for (let dep of rigJson5.dependencies) {
      if (dep.dev) {
        hasErr = true;
        print.error(`${dep.name} is in developing!\nUse correct version and set dev to false!`);
      }
    }
    if (hasErr) process.exit(1);
    print.succeed(`Ready for production!`);
  } catch (e) {
    print.error(e.message);
    process.exit(1);

  }
}
module.exports = {
  name: 'check',
  load
}

