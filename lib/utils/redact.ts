// Helpers to keep cloud credentials out of stdout.
//
// rig's deploy/publish flow prints (a) the resolved deploy target,
// (b) every Aliyun CDN API URL, and (c) the raw `-p` params string. All three
// carry the AccessKeyId / AccessKeySecret in clear, which makes the console
// output unsafe to copy/paste into issues, CI logs, or chat.
//
// Use `maskSecret` for short identifiers (keeps a head+tail hint so two
// different keys are still distinguishable in logs), `redactTarget` before
// console-logging a DeployTarget, `redactCdnUrl` before logging any signed
// Aliyun OpenAPI URL, and `redactParamsStr` before logging a `-p` params
// string (`ak=…&as=…&bucket=…`).

/** Mask a credential while keeping a short prefix + suffix for debuggability. */
export function maskSecret(s: string | undefined | null): string {
	if (!s) return '';
	if (s.length <= 8) return '****';
	return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/**
 * Return a shallow copy of a DeployTarget-shaped object with `access_key`
 * and `access_secret` masked. Unknown keys pass through unchanged.
 */
export function redactTarget<T extends Record<string, any>>(target: T): T {
	if (!target || typeof target !== 'object') return target;
	const out: Record<string, any> = { ...target };
	if (typeof out.access_key === 'string') out.access_key = maskSecret(out.access_key);
	if (typeof out.access_secret === 'string') out.access_secret = maskSecret(out.access_secret);
	return out as T;
}

/**
 * Redact `AccessKeyId` and `Signature` query parameters from an Aliyun
 * OpenAPI URL so the URL can be safely logged. Leaves all other params
 * (Action, Timestamp, etc.) intact for debugging.
 */
export function redactCdnUrl(url: string): string {
	if (!url) return url;
	return url
		.replace(/([?&]AccessKeyId=)([^&]+)/i, (_m, p1, v) => `${p1}${maskSecret(v)}`)
		.replace(/([?&]Signature=)([^&]+)/i, (_m, p1) => `${p1}REDACTED`);
}

/**
 * Redact credential values from a `-p` / params querystring
 * (e.g. `ak=...&as=...&bucket=...&region=...`) so it can be safely logged.
 *
 * AccessKey *IDs* (`ak` and aliases) keep a head+tail hint — like
 * `redactCdnUrl`'s AccessKeyId — so two keys stay distinguishable in logs.
 * AccessKey *secrets* (`as` and aliases) are fully redacted, like its
 * `Signature`. Non-credential params (bucket, region, custom template vars)
 * pass through unchanged.
 */
export function redactParamsStr(paramsStr: string | undefined | null): string {
	if (!paramsStr) return '';
	const idKeys = ['ak', 'access_key', 'accesskeyid'];
	const secretKeys = ['as', 'access_secret', 'accesskeysecret'];
	return paramsStr.replace(/(^|&)([^=&]+)=([^&]*)/g, (_m, sep, key, val) => {
		const k = String(key).toLowerCase();
		if (secretKeys.includes(k)) return `${sep}${key}=****`;
		if (idKeys.includes(k)) return `${sep}${key}=${maskSecret(val)}`;
		return `${sep}${key}=${val}`;
	});
}

export default {
	maskSecret,
	redactTarget,
	redactCdnUrl,
	redactParamsStr,
};
