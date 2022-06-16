export const rigHelper = `const json5 = require('json5');
const fs = require('fs');
const getPkgs = () => {
\tlet pkgArr = json5.parse(fs.readFileSync('./package.rig.json5'));
\tlet flatPkgArr = pkgArr.map((item, index) => {
\t\treturn item.name;
\t});
\tconsole.log(flatPkgArr);
\treturn flatPkgArr;
}

module.exports = {
\tgetPkgs
}
`;
export const packageRigJSON5 = `[
//  {
//    name: "your project name",
//    source: "git ssh url",
//    version: "semver version(like 1.0.0)",
//  },
]
`
