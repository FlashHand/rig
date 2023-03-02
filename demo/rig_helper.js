const json5 = require('json5');
const fs = require('fs');
const getPkgs = () => {
	let rigPkg = json5.parse(fs.readFileSync('./package.rig.json5'));
	return Object.keys(rigPkg.dependencies);
}

module.exports = {
	getPkgs
}
