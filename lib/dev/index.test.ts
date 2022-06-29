import path from 'path';
import RigConfig from '@/classes/RigConfig';
import dev from './index';
import fs from 'fs';
import {cat} from 'shelljs';

const JSON5 = require('json5');
const testPath = path.join(__dirname, '../../jest/test.rig.json5');

const testGitUrl = async ():Promise<RigConfig>=>{
	try{
		await dev({args: ['git@github.com:FlashHand/rig-test-1.git']}, testPath, false);
	}catch (e) {
	}
	return JSON5.parse(fs.readFileSync(testPath));
}
const testGitUrl2 = async ():Promise<RigConfig>=>{
	try{
		await dev({args: ['rig-test-2']}, testPath, false);
	}catch (e) {
	}
	return JSON5.parse(fs.readFileSync(testPath));
}
test('dev git url',async ()=>{
	const ret = await testGitUrl();
	expect(ret.dependencies['rig-test-1'].dev).toBe(true);

})
test('dev git name',async()=>{
	const ret2 = await testGitUrl2();
	expect(ret2.dependencies['rig-test-2'].dev).toBe(true);

})

