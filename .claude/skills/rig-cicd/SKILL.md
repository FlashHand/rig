---
name: rig-cicd
description: >-
  Agent skill for `rig build` / `rig deploy` / `rig publish` — rig's static-site CI/CD targeting Aliyun OSS + CDN. One OSS bucket serves many sites: each site is uploaded into its own subdirectory; CDN URI-rewrite rules (set by `rig publish`) map incoming `https://<domain>/...` to the right `oss://<bucket>/<deployDir>/...` path. Supports SPA hash, SPA history (BrowserRouter), MPA (one HTML per route), and any pre-built directory of HTML files. Trigger when the user wants to build/deploy/publish a web app via rig, debug a CDN rewrite, add a new endpoint or domain, switch web_type, or asks "rig 怎么部署" / "回源路径怎么改" / "一个 OSS 桶发多个站怎么配". Do NOT use for backend deploys, container registries, non-Aliyun providers (Huawei stub exists but isn't wired through), or package management (see rig-package).
user-invocable: true
disable-model-invocation: false
metadata:
  openclaw:
    requires:
      bins: [rig, git, yarn, node]
    os: [darwin, linux]
---

# rig-cicd — agent operator's playbook

## What this skill covers

rig ships three CI/CD commands that share the `cicd` block of `package.rig.json5`:

- `rig build [-s <schema>] [-p <params>] <dirPath>` — runs the per-endpoint build script with rig-injected variables (`publicPath`, `OUTPUT_DIR`, defines), then rewrites string tokens (`__RIG_PUBLIC_PATH__`, `__RIG_ENTRY_PATH__`, …) inside the built output. Output lands at `<source.root_path>/<deployDir>/`.
- `rig deploy [-s <schema>] [-p <params>] <dirPath>` — uploads `<source.root_path>/<deployDir>/` to the configured OSS bucket. Sets `Cache-Control: no-cache` on `index.html`, `max-age=31536000` on `.js` / `.css` / `.ico`.
- `rig publish [-s <schema>] [-p <params>] <dirPath>` — sets / updates Aliyun CDN **URI-rewrite** rules on each domain (this is what makes one bucket serve many sites), then refreshes the CDN cache.

Typical pipeline: `rig build "<dir>" && rig deploy "<dir>" && rig publish "<dir>"`. Build and deploy can run independently; **publish is the only step that touches CDN config** — re-run it whenever you change `web_type`, `endpoints`, `target`, or rename a `deployDir`.

The `<dirPath>` arg is a `/`-joined path matched against `tree_schema`. Use `%` as a wildcard and `%<group>` to reference a `groups[].name` (see `tree_schema` field below).

## Topology — one OSS bucket, many sites

A single OSS bucket holds every site:

```
oss://<bucket>/
  app-a/
    index.html
    assets/...
  app-b/
    index.html
    assets/...
  marketing/
    en/
      index.html
    zh/
      index.html
```

For each public domain you serve, CDN holds a stack of **URI rewrite** rules that map the user-visible path to a real OSS object. Example for `app-a.example.com` running SPA history mode:

| Match (incoming URI) | Rewrite to (origin path) | Purpose |
|---|---|---|
| `^/([^?]*\.[a-zA-Z0-9]+)($|\?)` | `/app-a/$1` | Any path ending in a file extension → that file under `app-a/` |
| `^/([\w-/]*\w+)(?![^?]*\.\w+)` | `/app-a/index.html` | Any extensionless path → SPA entry under `app-a/` |
| `^(/)($|\?|#|/\?|/$)` | `/app-a/index.html` | The web-entry path itself → SPA entry under `app-a/` |

`rig publish` generates these rules deterministically from `cicd.web_type` + each endpoint's `deployDir`, calls Aliyun CDN's `SetCdnDomainConfig` with `enhance_break` (stop processing further rules once matched), waits for the rule status to flip to `success`, then calls `RefreshObjectCaches` on the touched URLs. Failure modes: 10-min config-apply timeout, 10-min refresh timeout. The `setRewriteUri` / `refreshCache` retry loops poll every 3 s up to 100 ticks.

## `cicd` block — field reference

Lives inside `package.rig.json5` alongside `dependencies`. Comments are JSON5-legal.

```json5
{
  // ... dependencies block (see rig-package skill) ...

  cicd: {
    // tree_schema — REQUIRED. Slash-joined path schema describing the SHAPE of <dirPath> args.
    //   Each segment is a "DirLevel". Examples:
    //     'env/app'                          → two static segments: env, app.
    //     'env/{vendor}'                     → second level is dynamic (param name 'vendor').
    //     'env/%region/app'                  → second level uses a named group (see `groups`).
    //   Aliases: `path_schema` (kept for back-compat).
    tree_schema: 'env/app',

    // web_type — OPTIONAL, default 'hash'. Drives the CDN rewrite rules `rig publish` generates.
    //   'hash'    — SPA with hash routing (e.g. Vue Router hash mode, /#/foo).
    //               Files are NOT prefixed with deployDir (the build embeds publicPath itself);
    //               the only rule the publish step needs is "home → /<deployDir>/index.html".
    //               Lets ONE domain serve MULTIPLE hash-mode SPAs at different entry paths
    //               (/, /app1, /app2) because the runtime never asks the server for routes.
    //   'history' — SPA with history routing (BrowserRouter / Vue Router history mode).
    //               ALL extensionless paths → /<deployDir>/index.html (server falls through to SPA).
    //               File-extension paths → /<deployDir>/<path>.
    //   'mpa'     — Multi-Page App: one HTML per route. ALSO the right choice for "a pre-built
    //               directory of HTML files" (e.g. a docs site, a hand-written static site,
    //               a Next.js `next export` output).
    //               Extensionless path /foo → /<deployDir>/foo.html.
    //               File-extension path → /<deployDir>/<path>.
    web_type: 'history',

    // source — REQUIRED. Where rig reads the built artefacts from on the local filesystem.
    source: {
      // root_path — REQUIRED. Directory (relative to project root) that contains per-endpoint
      //   subdirs after `rig build`. `rig deploy` walks <root_path>/<deployDir>/ and uploads
      //   every file with the relative path used as the OSS object key.
      root_path: 'dist',
    },

    // target — REQUIRED. One DeployTarget object OR an array (only the first is used today).
    target: {
      // id — REQUIRED. Free-form label, used in logs.
      id: 'prod',

      // type — REQUIRED. Cloud provider. Currently only 'alicloud' is wired through publish + deploy.
      //   (A HuaweiDeploy.ts stub exists but is not connected to the publish path.)
      type: 'alicloud',

      // bucket / region / access_key / access_secret — REQUIRED. Aliyun OSS credentials.
      //   The same credentials are reused for CDN API calls during `rig publish`.
      //   NEVER inline real keys here — read from env (.env at project root) or the keychain and
      //   inject via `-p key=value` or `${VAR}` substitution in the file.
      bucket: 'my-site-bucket',
      region: 'oss-cn-hangzhou',
      access_key: '${ALIYUN_ACCESS_KEY}',
      access_secret: '${ALIYUN_ACCESS_SECRET}',

      // root_path / bucket_root_path — REQUIRED. OSS key prefix all uploads share. Use '/'
      //   unless your bucket is shared with non-rig content.
      root_path: '/',
      bucket_root_path: '/',

      // web_entry_path — OPTIONAL, default '/'. Fallback entry path when an endpoint omits its own.
      //   Used only in hash mode (history/mpa always treat '/' as entry).
      web_entry_path: '/',

      // uri_rewrite — OPTIONAL. Manual override for the CDN rewrite step. When set (with
      //   `original` or `original_regexp`), `rig publish` skips the auto-generated entry rule
      //   for that endpoint and uses this one instead.
      //   - original / original_regexp — the incoming URI to match. Pass a regex via
      //     original_regexp; plain prefixes via original. Example: '/admin'.
      //   - final — reserved, not consumed by publish today.
      //   Use this only when you need a non-standard entry path (e.g. `/portal` instead of `/`)
      //   on top of one of the three web_type modes.
      uri_rewrite: undefined,
    },

    // endpoints — REQUIRED. Map keyed by the dir path that, when joined with `tree_schema`,
    //   identifies one site to build/deploy/publish. Each value tells rig how to build it and
    //   where to put it.
    endpoints: {
      // The key 'prod/app-a' fits a tree_schema of 'env/app' (two static segments).
      'prod/app-a': {
        // build — REQUIRED unless vue_env is set. Shell command rig runs to produce the bundle.
        //   rig substitutes the following tokens in the string BEFORE exec:
        //     $public_path / __PUBLIC_PATH__ / __RIG_PUBLIC_PATH__ → the deploy dir as URL path
        //     __RIG_OUTPUT_DIR__                                  → <source.root_path>/<deployDir>
        //   Use `__RIG_OUTPUT_DIR__` for `--outDir` / `--dest` flags so build output lands in
        //   the right place. Output dir is also exported as the env var `OUTPUT_DIR` for the
        //   child process (`PUBLIC_PATH` is exported too).
        build: 'yarn vite build --base=__RIG_PUBLIC_PATH__ --outDir __RIG_OUTPUT_DIR__',

        // vue_env — OPTIONAL. If set (e.g. 'prod'), rig generates a .env.rig file with
        //   PUBLIC_PATH + OUTPUT_DIR + every key in `extra_env`, then defaults `build` to
        //   `npx vue-cli-service build --mode rig --dest <OUTPUT_DIR>`. Use this with
        //   vue-cli projects to skip writing a custom build string.
        vue_env: undefined,

        // extra_env — OPTIONAL. Extra env vars that should land in the per-build .env file when
        //   vue_env is set. Also reachable from the build script via process.env.
        extra_env: undefined,

        // target — OPTIONAL. Free-form label that points back to a DeployTarget. Reserved for
        //   future multi-target routing; today rig deploys/publishes to `cicd.target[0]`.
        target: 'prod',

        // domain / domains — REQUIRED. Public domain(s) the CDN rules will be set on.
        //   `domains` is the canonical field (array, multi-domain). `domain` is the legacy
        //   single-value field kept for back-compat. Use `domains`.
        domains: ['app-a.example.com'],

        // defines — OPTIONAL. String-replace map applied to every built .js / .ts / .html file
        //   AFTER the build runs. Both keys and values are treated as plain strings. rig
        //   pre-populates these for you:
        //     __PUBLIC_PATH__       → the deploy dir as URL path
        //     __DEPLOY_DIR__        → the deploy dir as URL path
        //     __RIG_PUBLIC_PATH__   → same
        //     __RIG_DEPLOY_DIR__    → same
        //     __RIG_ENTRY_PATH__    → the endpoint's web_entry_path
        //   The values you supply are themselves replaced for: $public_path, __PUBLIC_PATH__,
        //   __RIG_PUBLIC_PATH__, __DOMAIN__, __RIG_DOMAIN__ before they are substituted into
        //   files. Useful for bundling absolute API URLs that depend on the deploy domain.
        defines: {
          __API_BASE__: 'https://api.__RIG_DOMAIN__',
        },

        // web_entry_path — OPTIONAL. Where the SPA mounts in hash mode. Default '/'. Lets you
        //   put two hash-mode SPAs on one domain at /, /portal, etc. Ignored when
        //   web_type='history' or 'mpa' (those always use '/').
        web_entry_path: '/',

        // uri_rewrite — OPTIONAL per-endpoint override (same shape as target.uri_rewrite above).
        //   When set, suppresses the auto-generated entry rule for this endpoint only.
        uri_rewrite: undefined,
      },

      'prod/app-b': {
        build: 'yarn build --base=__RIG_PUBLIC_PATH__ --outDir __RIG_OUTPUT_DIR__',
        domains: ['app-b.example.com'],
      },
    },

    // groups — OPTIONAL. Named bundles of values for one dynamic level of tree_schema.
    //   Lets `rig build env/%region/app` expand across many regions. Each group:
    //   - name      Used in <dirPath> as `%<name>`. MUST start with `%`.
    //   - level     The DirLevel name (segment of tree_schema, without `{}`).
    //   - includes  Allowed values for that level. Endpoints whose actual dir value is not in
    //               `includes` are skipped during build/deploy/publish.
    groups: [
      { name: '%apac', level: 'region', includes: ['cn', 'jp', 'sg'] },
    ],
  },
}
```

### `<dirPath>` matching rules (read before debugging "no endpoints matched")

`tree_schema` declares the shape; `<dirPath>` selects which endpoints to act on:

- `prod/app-a` — exact match. Only the `prod/app-a` endpoint runs.
- `prod/%` — wildcard at level 2. All endpoints whose first segment is `prod` AND whose level 2 is **dynamic** (declared as `{...}` in `tree_schema`) match.
- `%/app-a` — wildcard at level 1. Only endpoints whose second segment equals `app-a`.
- `prod/%apac/app` — group wildcard. Iterates `groups['%apac'].includes` and picks endpoints whose level-2 value is in `['cn','jp','sg']`. (Requires `tree_schema` to have THREE segments.)
- Extra trailing segments past `tree_schema.length` are appended to each matching endpoint's `deployDir`. E.g. with `tree_schema: 'env/app'` and `<dirPath>: 'prod/app-a/v2'`, the endpoint `prod/app-a` gets deployed to `<bucket>/prod/app-a/v2/`. This lets you push the same code under a versioned subpath without editing `endpoints`.

`-p key=value` and `-s key=value` further substitute `${key}` (in the JSON5 file) and `{key}` (inside `<dirPath>`) at run time. Use them for branch/PR/env scoping in CI.

## Intent → command map

| User intent | Action |
|---|---|
| "build everything for prod" | `rig build "prod"` (matches every endpoint whose first segment is `prod` if level 2 is dynamic, or just one if it's static). Verify the dist tree exists at `<source.root_path>/<deployDir>/` before deploying. |
| "build + deploy + publish one site" | `rig build "<dirPath>"` → `rig deploy "<dirPath>"` → `rig publish "<dirPath>"`. Publish is the slow one (CDN-config apply 30 s – minutes; cache refresh another minute). |
| "I changed web_type / endpoints / deployDir" | Re-run `rig publish "<dirPath>"` on every affected endpoint. Build + deploy alone do NOT update CDN rules. |
| "the site is showing the WRONG site" | Two suspects: (1) CDN rewrite rule is wrong — check Aliyun console → CDN domain → 配置 → 高级配置 → URI 改写; expect a rule per row matching the table in the topology section. (2) The OSS object isn't where you think — `aliyun oss ls oss://<bucket>/<deployDir>/`. Confirm `index.html` exists. |
| "404 on a deep route in history mode" | CDN rewrite rules missing the `^/([\w-/]*\w+)(?![^?]*\.\w+)` → `/<deployDir>/index.html` rule. Re-run `rig publish` to regenerate. |
| "404 on a deep route in MPA mode" | Means the matching `.html` file does not exist in OSS. The MPA rewrite is `/foo` → `/<deployDir>/foo.html` — your build must emit `foo.html`. If it emits `foo/index.html`, switch web_type or change the rewrite via `target.uri_rewrite`. |
| "rebuild publicPath was wrong, hash mode" | rig injects `__RIG_PUBLIC_PATH__` / `__PUBLIC_PATH__` and the `PUBLIC_PATH` env var. Use one of them in the bundler config (`vite --base`, Vue CLI `publicPath`, webpack `output.publicPath`). hash mode does NOT prefix OSS path with deployDir at the CDN layer — the bundle has to know its own deploy dir at build time. |
| "want a new domain on an existing site" | Add to the endpoint's `domains` array. Re-run `rig publish` (no rebuild needed). |
| "want one OSS bucket for two completely different sites" | That's the default model. Two endpoints with different `deployDir`s and different `domains`. `rig publish` writes per-domain rewrite stacks; the bucket is shared. |
| "deploy a pre-built static dir (docs site, hand-written HTML)" | Set `web_type: 'mpa'`. Point `endpoints.<dir>.build` at whatever produces the dir (or a no-op like `cp -r src/site dist/<deployDir>` if there's nothing to build). The MPA rewrite handles both `/about` → `/about.html` and `/img.png` → `/img.png`. |
| "credentials in package.rig.json5 — is that OK?" | NO. Use `${VAR}` interpolation or `-p key=value` and store the real values in env / keychain. Anything committed is shared with everyone who clones. |

## How it works under the hood

`rig build` (lib/build/index.ts):
1. Load `cicd` block; create `CICD` (parses `tree_schema` into `DirLevel[]`, builds an `Endpoint[]`).
2. Create `CICDCmd` from the `<dirPath>` arg — filters endpoints by `matchCmd()`, appends extra trailing path segments to each surviving endpoint's `deployDir` / `publicPath`.
3. For each surviving endpoint:
   - Replace `$public_path`, `__PUBLIC_PATH__`, `__RIG_PUBLIC_PATH__`, `__DOMAIN__`, `__RIG_DOMAIN__` in `defines`.
   - If `vue_env`, write `.env.rig` (via `lib/env`), default the `build` string if missing.
   - Replace `$public_path`, `__RIG_OUTPUT_DIR__` in `build`. shelljs.exec.
   - Walk the output dir; replace every `defines` key in every `.js` / `.ts` / `.html` file.

`rig deploy` (lib/deploy/index.ts):
1. Same `CICD` / `CICDCmd` setup.
2. For each endpoint: walk `<root_path>/<deployDir>/` recursively, upload every file via `ali-oss`'s `putStream` with the relative path as OSS key. `index.html` → `Cache-Control: no-cache`; `.js`/`.css`/`.ico` → `max-age=31536000`. Everything else uses bucket default.

`rig publish` (lib/publish/index.ts):
1. Same `CICD` / `CICDCmd` setup.
2. Group rewrite rules by **domain** (a domain can host multiple endpoints — uncommon but supported).
3. For each domain, build the rewrite stack from `web_type`:
   - `hash`: only the file-extension passthrough `/<file>` → `/<file>` (no deployDir prefix — bundle is built with publicPath baked in) plus the entry rule (`/` or `web_entry_path` → `/<deployDir>/index.html`).
   - `history`: file-extension paths → `/<deployDir>/<path>`; everything else → `/<deployDir>/index.html`.
   - `mpa`: file-extension paths → `/<deployDir>/<path>`; extensionless paths → `/<deployDir>/<path>.html`; entry rule for `/`.
   - If endpoint or target supplies `uri_rewrite`, only the file-extension rule + the custom entry are emitted (no auto extensionless rule). Useful for irregular sites mounted at non-root paths.
4. Call `cdn.setRewriteUri(domain, originals, deployDirs, ['enhance_break'])`. Poll `describeCdnDomainConfigs` every 3 s; succeed when all configs reach `Status: success`; fail on any `Status: failed` or after 100 ticks.
5. Call `cdn.refreshCache(urls.join('\n'))` on every touched entry URL. Poll `describeRefreshTaskById` the same way.

### Order matters when re-running publish

`SetCdnDomainConfig` appends rules — it does NOT replace the existing stack. If you change `deployDir` for an endpoint and re-publish, **both the old and new rules are now active**, and Aliyun evaluates the **first match wins** (the `enhance_break` action stops the chain). The old rule may shadow the new one. Cleanup steps:

1. Aliyun console → CDN → domain → 配置 → 高级配置 → URI 改写 → delete obsolete rules manually, OR
2. Use Aliyun's `BatchDeleteCdnDomainConfig` API if you script it (rig has no built-in cleanup today — surface this as a known gap when migrating endpoints).

## What rig CI/CD does NOT do

- **No non-Aliyun providers.** `HuaweiDeploy.ts` exists but is not wired into publish; CloudFront / Fastly / Cloudflare are out of scope.
- **No backend deploy.** Container images, lambdas, server bundles — find another tool.
- **No environment promotion ladder.** rig has no notion of "promote from staging → prod". Use distinct `tree_schema` segments (`env`) and run publish per env.
- **No rule cleanup.** Renaming a `deployDir` leaves orphan CDN rules pointing at the old path. Delete by hand.
- **No publish-time secret scanning.** Don't commit credentials into `package.rig.json5`; the deploy pipeline will happily ship them.

## Reporting & cleanup checklist (after non-trivial changes)

- After `rig build`: confirm `<source.root_path>/<deployDir>/index.html` exists for every targeted endpoint.
- After `rig deploy`: spot-check OSS with `aliyun oss ls oss://<bucket>/<deployDir>/`.
- After `rig publish`: open `https://<domain><web_entry_path>` and a deep route; both should respond 200 with the expected content. Cache may take another 30 s to settle even after the refresh task reports `Complete`.
- When migrating `web_type`, list every endpoint that was on the old type and re-publish each one — the rewrite stack is per-domain, not per-endpoint.
