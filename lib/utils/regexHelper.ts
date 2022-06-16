/**
 * @ignore
 * @Description nothing
 * @author Wang Bo (ralwayne@163.com)
 * @date 2020/10/10 3:57 PM
 */
const gitURL = /(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\.git)(\/?|\#[-\d\w._]+?)$/;


const path = /^(\/\w+){0,2}\/?$/;
/**
 * 文字下划线中划线
 * @type {RegExp}
 */
const dynamicDir = /(^\[[\w\-]+\]$)|(^\{[\w\-]+\}$)/
export default {
	gitURL,
	path,
	dynamicDir
}
