const json5 = require('json5');
const fs = require('fs');
const getPkgs = () => {
	let pkgArr = json5.parse(fs.readFileSync('./package.rig.json5'));
	let flatPkgArr = pkgArr.map((item, index) => {
		return item.name;
	});
	console.log(flatPkgArr);
	return flatPkgArr;
}

module.exports = {
	getPkgs
}
