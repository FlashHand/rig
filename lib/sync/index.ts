import axios from 'axios';
import RigConfig from '@/classes/RigConfig';
import url from 'url';
import path from 'path';
import fs from 'fs';
import print from '../print';

const syncFile = async (shareContent: string, force: boolean = false) => {
	const filename = path.basename(url.parse(shareContent).pathname!);
	const shareFilePath = path.join(process.cwd(), filename);
	if (fs.existsSync(shareFilePath) && !force) {
		print.info(`${filename} already exists.`);
		return;
	}
	print.info(`Start downloading ${filename}`);
	const fileStr = (await axios.get(shareContent)).data;
	fs.writeFileSync(shareFilePath, fileStr);
};
export default async (cmd: any) => {
	const rigConfig = RigConfig.createFromCWD();
	for (let key in rigConfig.share) {
		if (Array.isArray(rigConfig.share[key])) {
			const shareContentArr = rigConfig.share[key] as string[];
			for (let shareContent of shareContentArr) {
				await syncFile(shareContent, cmd.force);
			}
		} else {
			const shareContent = rigConfig.share[key] as string;
			await syncFile(shareContent, cmd.force);
		}
	}
}
