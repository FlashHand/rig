import path from 'path';

const testPath = path.join(__dirname, '../../jest/test.rig.json5');
import RigConfig from '@/classes/RigConfig';

test('RigConfig init dependencies', () => {
	const testConfig = RigConfig.createFromPath(testPath);
	expect(testConfig.dependencies).toEqual({
			'rig-test-1': {
				source: "git@github.com:FlashHand/rig-test-1.git",
				version: "1.0.1"
			}
		});
});
