import fsHelper from '@/utils/fsHelper';

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

}
type DepDict ={ [name: string]: Dep; }
export class DepCollection {
	dependencies: DepDict= {};
	constructor(dependencies:DepDict) {
		this.dependencies = dependencies;
	}

	checkDepExists(name:string){
		return Object.keys(this.dependencies).find((key) => {
			return name === key;
		}) == undefined;
	}
	static createFromConfig(){
		const config = fsHelper.readConfig();
		return new DepCollection(config.dependencies);
	}
	findDepByName(name:string){

	}
}
