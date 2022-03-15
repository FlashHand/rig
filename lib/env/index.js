/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2021/11/18 6:14 PM
 */
const fs = require('fs');
const json5 = require('json5');
const print = require("../print");

//加载命令控制器
const load = async (cmd) => {
  try {
    const mode = process.argv[process.argv.length -1];
    const rigJson5 = json5.parse(fs.readFileSync('env.rig.json5'));
    const modeObj = rigJson5[mode];
    if (modeObj) {
      const keysArray = Object.keys(modeObj);
      let content = "";
      for (let i = 0; i<keysArray.length; i++) {
        const key = keysArray[i];
        const value = modeObj[key];
        content += key + " = " + value + "\n"
      }
      fs.writeFile('./.env.rig', content, {flag: "w"}, err => {
        err && print.error(err);
      });
    } else {
      print.error("请先在env.rig.json5文件中配置" + mode + "模式的环境变量");
    }
  } catch (e) {
    print.error(e.message);
  }
}

module.exports = {
  load
}
