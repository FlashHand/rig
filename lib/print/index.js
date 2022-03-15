/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/20 7:32 PM
 */
const ora = require('ora');
const chalk = require('chalk');

let green = chalk.greenBright;

let red = chalk.redBright;
let yellow = chalk.yellowBright;
let printer = ora();
const info = (str)=>{
  printer.info(green(str));
}
const error = (str)=>{
  printer.fail(red(str));
}
const warn = (str)=>{
  printer.warn(yellow(str));
}
const succeed = (str)=>{
  printer.succeed(green(str));
}

module.exports = {
  info,
  warn,
  error,
  succeed
}
