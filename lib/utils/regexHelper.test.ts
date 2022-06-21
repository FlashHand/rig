import regexHelper from '@/utils/regexHelper';
test('matchGitName', () => {
	const retGit = 'git@git.domain.com:f2e-common/r-test.git'.match(regexHelper.matchGitName);
	const retHttp = 'https://git.domain.com/f2e-common/r-test.git'.match(regexHelper.matchGitName);
	if (retGit) {
		expect(retGit[2]).toContain('r-test');
	}
	if (retHttp) {
		expect(retHttp[2]).toContain('r-test');
	}
});

