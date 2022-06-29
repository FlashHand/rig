const sortKeys = (obj: any) => {
	return Object.keys(obj).sort().reduce(
		(sortedObj: any, key) => {
			sortedObj[key] = obj[key];
			return sortedObj;
		},
		{}
	);
}
export default {
	sortKeys
}
