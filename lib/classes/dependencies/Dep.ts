import print from '@/print';
import semver from 'semver';
let gitUrlReg = /(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\.git)(\/?|\#[-\d\w._]+?)$/;

export class Dep {
	version?: string
	name: string;
	source: string;
	dev = false;

	constructor(props: Partial<Dep>) {
		if (!props.name) {
			throw new Error(`Dep's name should not be ${props.name}.`);
		}
		if (!props.source) {
			throw new Error(`Dep's source should not be ${props.source}.'`);
		}
		this.name = props.name!;
		this.source = props.source!;
		this.version = props.version;
		this.dev = props.dev || false;
	}
	validateName(){
		if (this.name) {
			return true;
		} else {
			print.error(`name value(${this.name}) invalid`);
			return false;
		}
	}
	validateSource(){
		let isValid;
		try {
			isValid = gitUrlReg.test(this.source);
		} catch (e) {
			isValid = false;
			print.error(e.message);
		}
		if (!isValid) {
			print.error(`source value(${this.source}) invalid！`);
		}
		return isValid;
	}
	 validateVersion(){
		let isValid = this.dev?true:!!semver.valid(this.version);
		if (!isValid) {
			print.error(`version field must follow Semantic Versioning 2.0.0(https://semver.org/)`);
		}
		return isValid;
	}

	/**
	 * 检查配置项格式是否正确
	 */
	validate(){
		return  this.validateName() && this.validateSource() && this.validateVersion();
	}


}
