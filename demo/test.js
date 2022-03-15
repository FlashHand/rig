// const fs = require('fs');
// let pkgStr = fs.readFileSync('package.json').toString();
// let pkg = JSON.parse(pkgStr);
// console.log(pkg);
// pkg.info = 'test';
// // fs.('package.json');
// fs.writeFileSync('package.json', JSON.stringify(pkg,null,2));
//  pkgStr = fs.readFileSync('package.json').toString();
//  pkg = JSON.parse(pkgStr);
// console.log(pkg);
//
console.log(/^([a-z]+-){1,3}([0-9]+)(\.([0-9]+)){3}$/.test('a-a-1.2.1.1'));
//cmd
// console.log(/^(\.([0-9]+)){3}$/.test('a-a-1.2.1.1'));
console.log('a-a-1.2.1.1'.split(/(?<=[a-z])-(?=[0-9])/));

//抓取版本

