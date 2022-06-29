import {Dep} from '@/classes/dependencies/Dep';
import fsHelper from '@/utils/fsHelper';
import objectHelper from '@/utils/objectHelper';

const JSON5 = require('json5');

interface RigConfigJSON5 {
	dependencies: { [name: string]: Dep; };
}

class RigConfig {
	dependencies: { [name: string]: Dep; } = {};

	constructor(configJSON5: RigConfigJSON5) {
		this.dependencies = configJSON5.dependencies;
		this.validate();
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
	static createFromPath(path: string) {
		const configJSON5 = fsHelper.readConfig(path);
		return new RigConfig(configJSON5);
	}
	validate(){
		console.log(`rig preinstall:validating dependencies...`);
		for (let key in this.dependencies){
			const ret = this.dependencies[key].validate();
			if (!ret){
				throw new Error(`rig preinstall:validating:${this.dependencies[key]} is invalid`);
			}
		}
	}
	toString() {
		return JSON5.stringify(this, null, 2);
	}

	overwrite(overwritePath: string = '') {
		overwritePath ? fsHelper.writeConfig(this, overwritePath) : fsHelper.writeConfig(this);
	}

	checkDepExists(name: string) {
		return Object.keys(this.dependencies).find((key) => {
			return name === key;
		}) == name;
	}

	setDependencyToDev(name: string) {
		this.setDependenciesToDev(name);
	}

	setDependenciesToDev(names: string | string[]) {
		let nameArr = [];
		if (Array.isArray(names)) {
			nameArr.push(...names);
		} else {
			nameArr.push(names);
		}
		nameArr.forEach(name => {
			this.dependencies[name].dev = true;
			this.dependencies[name] = objectHelper.sortKeys(this.dependencies[name]);

		});
	}

	findOrUpsertDep(name: string, dep: Dep) {
		if (this.checkDepExists(name)) {
			this.dependencies[name].dev = true;
		} else {
			this.dependencies[name] = dep;
		}
		this.dependencies[name] = objectHelper.sortKeys(this.dependencies[name]);
	}
}

export default RigConfig;
