const checkDepVersions = ()=>{
	console.log('deps is in developing');
}
const load = async (cmd) => {
	checkDepVersions();
}
module.exports = {
	load,
	checkDepVersions,
}
