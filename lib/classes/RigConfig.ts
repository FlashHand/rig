import {Dep} from '@/classes/dependencies/Dep';
import fsHelper from '@/utils/fsHelper';
import objectHelper from '@/utils/objectHelper';
import print from '@/print';
import shell from 'shelljs';
import semver from 'semver';
import compareVersions from 'compare-versions'

const JSON5 = require('json5');

interface RigConfigJSON5 {
	dependencies: { [name: string]: Dep; };
	share:{ [name: string]: string | string[]; };
}

class RigConfig {
	dependencies: { [name: string]: Dep; } = {};
	isLegacy = false;
	share: { [name: string]: string | string[]; } = {};


	constructor(rigConfig: RigConfigJSON5 | Dep[]) {
		if (Array.isArray(rigConfig)) {
			//旧版配置
			this.isLegacy = true;
			const depArrLegacy = rigConfig as Dep[];
			for (let depLegacy of depArrLegacy) {
				const dep = new Dep(depLegacy);
				this.dependencies[dep.name] = dep;
			}
		} else {
			for (let rigName in rigConfig.dependencies) {
				this.dependencies[rigName] = new Dep({...rigConfig.dependencies[rigName], name: rigName})
			}
			this.share = rigConfig.share;
		}
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

	validate() {
		print.info(`rig validating rig-dependencies...`);
		for (let key in this.dependencies) {
			const ret = this.dependencies[key].validate();
			if (!ret) {
				throw new Error(`rig validating:${this.dependencies[key]} is invalid`);
			}
		}
	}

	/**
	 * 检查依赖的之间的依赖(仅包含rig管理下的依赖)
	 *
	 */
	validateDeps() {
		print.info(`rig validating dependencies' requirements`);
		let valid = true;
		for (let rigName in this.dependencies) {
			const rigDep = this.dependencies[rigName];
			try {
				let pkgStr: string;
				if (rigDep.dev) {
					pkgStr = fsHelper.readPkgStrInRepo(rigName);
					print.info(`${rigName} is in deleloping.Validating ${rigName}'s dependencies...`);
				} else {
					const cmd = `git fetch ${rigDep.source} refs/tags/${rigDep.version} && git show FETCH_HEAD:package.json`;
					print.info(`validateDeps:${cmd}`);
					let showPackageProcess = shell.exec(cmd,
						{silent: true}
					);
					pkgStr = showPackageProcess.stdout.trim();
				}
				const pkg = JSON.parse(pkgStr);
				//获取rig依赖
				if (pkg.rig) {
					const pkgRig = pkg.rig;
					//遍历rig依赖
					Object.keys(pkgRig).forEach(key => {
						//获取该rig依赖的要求的版本范围
						let max = '';
						let min = '';
						if (Array.isArray(pkgRig[key])) {
							//使用数组的情况
							if (pkgRig[key].length == 0) {
								//依赖该库，但是无版本要求
							} else if (pkgRig[key].length == 1) {
								min = semver.valid(pkgRig[key][0]) || '';
							} else if (pkgRig[key].length == 2) {
								min = semver.valid(pkgRig[key][0]) || '';
								max = semver.valid(pkgRig[key][1]) || '';
							} else {
								print.error(`invalid array ${JSON.stringify([key])}`);
								valid = false;
							}
						} else {
							//使用字典的情况
							min = pkgRig[key]['min'] || '';
							max = pkgRig[key]['max'] || '';
						}
						//从rigJson5获取该依赖的版本号
						const dep = this.dependencies[key]
						print.info(`checking requirements of ${rigName}: ${key}[${min},${max}]`);
						if (dep) {
							if (dep.dev) {
								valid = true;
							} else {
								if (min) {
									if (!dep.version) throw new Error(`${dep.name}'s version is invalid:${dep.version}`)
									valid = compareVersions(dep.version, min) >= 0;
								}
								if (max) {
									if (!dep.version) throw new Error(`${dep.name}'s version is invalid:${dep.version}`)
									valid = compareVersions(dep.version, max) <= 0
								}
								if (!valid) {
									throw new Error(`${rigName} requires ${key}[${min},${max}],but ${key} is ${dep.version}!`);
								}
							}
						} else {
							print.error(`${key}[${min},${max}] is required`);
							valid = false;
						}
					})
				}

			} catch (e) {
				throw new Error(`rig validateDeps failed:${e.message}`);
			}
		}
	}

	toString() {
		return JSON5.stringify(this, null, 2);
	}

	overwrite(overwritePath: string = '') {
		overwritePath ? fsHelper.writeConfig(this, overwritePath) :
			fsHelper.writeConfig({
				dependencies: this.dependencies
			});
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
