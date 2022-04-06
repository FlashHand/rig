declare namespace preinstall {
	function load(): void;
	const name: string;
	const checkDepsValid: (rigJSON5:any) => void

}
export default preinstall;
