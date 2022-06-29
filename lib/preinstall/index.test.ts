const checkDepsValid = require('./index').checkDepsValid;
const testRigPkgArr = [
	{
		name: "rig-test-1",
		source: "git@github.com:FlashHand/rig-test-1.git",
		version: "1.0.1",
	},
	{
		name: "rig-test-2",
		source: "git@github.com:FlashHand/rig-test-2.git",
		version: "1.0.2",
	},
];
test('checkDepsValid', () => {
	expect(checkDepsValid(testRigPkgArr)).toBe(true);
});
