---
id: sec-oss-cred-log-redaction
title: Redact OSS AccessKey ID/Secret from deploy/publish stdout
status: done
type: issue
severity: security
verify: yarn test && yarn build
depends-on: []
---

## Problem

`rig build` / `rig deploy` / `rig publish` all funnel through
`CICD.createByDefault(cmd)`, which logged the raw `-p` params string:

```ts
// lib/classes/cicd/CICD.ts
console.log('paramsStr', paramsStr); // e.g. ak=LTAI…&as=…&bucket=…&region=…
```

`paramsStr` carries the Aliyun OSS AccessKey **ID** (`ak`) and **Secret**
(`as`) in clear. Any CI job or shared terminal running deploy/publish writes
the credentials into its logs.

Sibling logs were audited and are already safe:
- `lib/deploy/index.ts` — `redactTarget(target)` already masks the deploy target.
- `lib/classes/cicd/Deploy/CDN.ts` — `redactCdnUrl(url)` already masks the signed CDN URL.
- `Endpoint.target` is a string id (not the `DeployTarget` creds object), so the
  `cicdCmd.endpoints` / `util.inspect(this.endpoints)` dumps do not leak.
- `RigConfig.ts` `console.log(pkgStr)` is the `rig install` dependency path
  (a dependency's `package.json`), unrelated to the `-p ak=&as=` flow.

So the single `paramsStr` log was the only raw OSS-credential leak, and it sits
at the shared chokepoint — fixing it covers build/deploy/publish at once.

## Fix

- Add `redactParamsStr()` to `lib/utils/redact.ts`. AccessKey *IDs*
  (`ak`/`access_key`/`accesskeyid`) keep a head+tail hint (matching
  `redactCdnUrl`'s AccessKeyId handling); AccessKey *secrets*
  (`as`/`access_secret`/`accesskeysecret`) are fully redacted (matching its
  `Signature=REDACTED`). Non-credential params (bucket, region, custom template
  vars) pass through unchanged.
- Use it at the single `console.log('paramsStr', …)` chokepoint.
- Regression guard: `lib/utils/redact.test.ts` asserts the raw `ak`/`as` values
  never appear in the redacted output and non-secret params survive.

## Verification

- `yarn test` — redact unit tests pass.
- `yarn build` — type-check + bundle clean (also runs `gitleaks` on `built/`).
- `rg "console\.(log|info)" lib` re-audited: no remaining call prints a raw OSS secret.
