# cicd
### example:
```json5
{
  cicd: {
    path_schema: "demo/{env}/{oem}",
    source: {
      root_path: "dist",
    },
    web_entry_path: '/',
    target: {
      id: "alicloud",
      type: "alicloud",
      bucket: "deploy",
      region: "oss-somewhere",
      access_key: "${ak}",
      access_secret: "${as}",
      root_path: "/",
    },
    endpoints: {
      "demo/test/oem1": {
        build: 'yarn cross-env OUTPUT_DIR=__RIG_OUTPUT_DIR__ PUBLIC_PATH=__RIG_PUBLIC_PATH__ vue-cli-service build',
        defines: {
          RIG_REPLACE_GRAY: '/test-gray'
        },
        domains: [
          "oem1.domain.com"
        ],
      },
      "demo/test/oem2": {
        build: 'yarn cross-env OUTPUT_DIR=__RIG_OUTPUT_DIR__ PUBLIC_PATH=__RIG_PUBLIC_PATH__ vue-cli-service build',
        defines: {
          RIG_REPLACE_GRAY: '/test-gray'
        },
        domains: [
          "oem2.domain.com"
        ],
      },
    },
    groups: [
      {
        name: "%group1",
        level: "oem",
        includes: [
          "oem1",
          "oem2"
        ]
      },
    ]
  },
}
```
|字段|说明|默认值|备注|
|:---|:---|:---|:---|
|path_schema|打包文件目录在source.root_path下前缀||
|source.root_path|打包文件所在目录|dist|
|web_entry_path|网站访问的根目录|/|有的网页首页不是用/直接访问，而是例如：https://domain.com/path_to_index|

|target字段|说明|默认值|备注|
|:---|:---|:---|:---|
|id|目前暂无作用，部署目标的id,为多目标部署设计而预留|||
|type|目前死为alicloud，部署目标的类型|alicloud||
|bucket|ali-oss的bucket|
|region|bucket的region|
|access_key|oss访问授权| |${}的作用是该位置参数可以通过命令行配置，可以方式密钥暴露|
|access_secret|oss访问授权| ||
|root_path|bucket存放网站的根目录|/| |

|endpoint字段|说明|默认值|备注|
|:---|:---|:---|:---|
|key|实际的路径前缀,必须符合path_schema|||
|type|部署目标的类型，目前写死为alicloud|alicloud||
|build|build脚本，必须将文件||需要将文件打包到__RIG_OUTPUT_DIR__下|
|defines|预定义可替换字段||rig build完成后，会对所有的文本进行字段替换|
|domains|需要部署的cdn域名||rig publish 会通过uri rewrite指向对应资源目录|

#### path_schema
rigjs 采用文件目录管理CICD.

path_schema是文件打包目录前缀;

在执行rig build|deploy|publish时，传入的路径的开头都必须符合path_schema.

{}的作用是可变目录，在执行build|deploy|publish命令时可以指定该位置的目录名。
可变目录使用比较灵活。

#### rig build
**example-1**
通过-s 传入querystring，指定各位置的目录。
```shell
rig build demo/{env}/{oem}/1.1 -s env=test&oem=oem1
#等价于
rig build demo/test/oem1/1.0.0.0
```
**example-2**
利用%通配符，同时打包到多个目录下
```shell
rig build demo/{env}/%/1.1 -s env=test
#等价于
rig build demo/test/oem1/1.0.0.0 && rig build demo/test/oem2/1.0.0.0
```
**注意：demo必须得写死，只有用{}包起来才是名称可变目录**

#### rig deploy
将代码发布到阿里云OSS中。
```shell
rig deploy demo/test/oem1/1.0.0.0 -p 'ak=your_access_token&as=your_access_secret'
#-p的作用是用来替换${}参数。
```
#### rig publish
将cdn回源到该目录下的网站，并刷新预热，完成后网页才算发布成功。
```shell
rig publish demo/test/oem1/1.0.0.0 -p 'ak=your_access_token&as=your_access_secret'
```

你可以在github或gitlab的cicd脚本中灵活使用build|deploy|publish命令，
将不同环境或不同定制版的包打到不同目录下。
另外path_schema可以帮助开发防止打包目录混乱的情况。


