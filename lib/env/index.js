/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2021/11/18 6:14 PM
 */
const fs = require('fs');
const json5 = require('json5');
const print = require("../print");

const useEnv =  (mode,extra)=>{
  try {
    const rigJson5 = json5.parse(fs.readFileSync('env.rig.json5'));
    let modeObj = rigJson5[mode];
    if (modeObj) {
      if (extra) modeObj = Object.assign(modeObj, extra);
      const keysArray = Object.keys(modeObj);
      let content = "";
      for (let i = 0; i<keysArray.length; i++) {
        const key = keysArray[i];
        const value = modeObj[key];
        content += key + " = " + value + "\n"
      }
      print.info(`using env:`)
      console.log(content);
      fs.writeFileSync('./.env.rig', content, {flag: "w"});
    } else {
      print.error("请先在env.rig.json5文件中配置" + mode + "模式的环境变量");
      process.exit(1)
    }
  } catch (e) {
    print.error(e.message);
    process.exit(1)
  }
}
//加载命令控制器
const load = async (cmd) => {
  try {
    const mode = process.argv[process.argv.length -1];
    useEnv(mode);
  } catch (e) {
    print.error(e.message);
    process.exit(1)
  }
}

module.exports = {
  load,
  useEnv
}