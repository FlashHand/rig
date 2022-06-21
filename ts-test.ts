import regexHelper from './lib/utils/regexHelper';

const ret = 'git@git.rys.cn:f2e-common/r-admin-doc.git'.match(regexHelper.matchGitName);
console.log(ret);
