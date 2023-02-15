const json5 = require('json5');
const fs = require('fs');
const getRigDeps = () => {
	let rigConfig = json5.parse(fs.readFileSync('./package.rig.json5'));
	return Object.keys(rigConfig.dependencies);
}
module.exports = {
	getPkgs: getRigDeps,
	getRigDeps
}
