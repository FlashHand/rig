# dependencies

```json5
/*
dev:
  dev默认为false,为true时，执行yarn install,代码库会被clone
source:
  source是代码库的地址，目前只支持git ssh地址，暂时不支持http地址。
version:
  dev为false时生效，version指定tag的代码库的版本下载到node_modules中.
  version支持semver格式,
*/

{
  dependencies: {
    'rig-test-1': {
      dev: true,
      source: 'git@github.com:FlashHand/rig-test-1.git',
      version: '1.0.1',
    },
    'rig-test-2': {
      dev: false,
      source: 'git@github.com:FlashHand/rig-test-2.git',
      version: '1.0.2',
    },
  }
}
```
