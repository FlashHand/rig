/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/20 7:32 PM
 */
const ora = require('ora');
const chalk = require('chalk');

let printer = ora();

const start = (str: string) => {
	printer.start(chalk.blueBright(str));
}

const info = (str: string) => {
	printer.info(chalk.hex('#37BA85')(str));
}

const error = (str: string) => {
	printer.fail(chalk.hex('#FF4848')(str));
}

const warn = (str: string) => {
	printer.warn(chalk.yellowBright(str));
}

const succeed = (str: string) => {
	printer.succeed(chalk.greenBright(str));
}

export default {
  start,
	info,
	error,
	warn,
	succeed,
}
