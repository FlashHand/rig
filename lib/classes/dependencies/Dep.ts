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
