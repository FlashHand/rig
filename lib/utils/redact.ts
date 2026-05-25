// Helpers to keep cloud credentials out of stdout.
//
// rig's deploy/publish flow prints (a) the resolved deploy target and
// (b) every Aliyun CDN API URL. Both carry the AccessKeyId / AccessKeySecret
// in clear, which makes the console output unsafe to copy/paste into issues,
// CI logs, or chat.
//
// Use `maskSecret` for short identifiers (keeps a head+tail hint so two
// different keys are still distinguishable in logs), `redactTarget` before
// console-logging a DeployTarget, and `redactCdnUrl` before logging any
// signed Aliyun OpenAPI URL.

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

export default {
	maskSecret,
	redactTarget,
	redactCdnUrl,
};
