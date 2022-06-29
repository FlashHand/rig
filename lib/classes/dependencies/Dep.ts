import print from '@/print';
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
		let isValid;
		try {
			isValid = this.dev?true:!!this.version?.length;
		} catch (e) {
			isValid = false;
			print.error(e.message);
		}
		if (!isValid) {
			print.error(`version value(${this.version}) invalid！`);
		}
		return isValid;
	}
	validate(){
		let isValid = true;
		this.validateName();
		this.validateSource();
	}


}
