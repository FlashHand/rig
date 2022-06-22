import {Dep} from '@/classes/dependencies/Dep';
import fsHelper from '@/utils/fsHelper';

interface RigConfigJSON5 {
	dependencies: { [name: string]: Dep; };
}

class RigConfig {
	dependencies: { [name: string]: Dep; } = {};

	constructor(configJSON5: RigConfigJSON5) {
		this.dependencies = configJSON5.dependencies;
	}

	/**
	 * createFromCWD 从当前工作目录创建config对象
	 * @returns {RigConfig}
	 */
	static createFromCWD() {
		const configJSON5 = fsHelper.readConfig();
		return new RigConfig(configJSON5);
	}

	/**
	 * createFromPath 从absolute path中创建config对象
	 * @param {string} path
	 * @returns {RigConfig}
	 */
	static createFromPath(path:string) {
		const configJSON5 = fsHelper.readConfig(path);
		return new RigConfig(configJSON5);
	}

	overwrite() {
	}

	checkDepExists(name: string) {
		return Object.keys(this.dependencies).find((key) => {
			return name === key;
		}) == undefined;
	}

	findOrUpsertDep(name: string, dep: Dep) {
		if (this.checkDepExists(name)) {
			Object.assign(this.dependencies[name], dep);
		} else {
			this.dependencies[name] = dep;
		}
	}
}

export default RigConfig;
