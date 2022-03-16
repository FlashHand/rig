const { defineConfig } = require('@vue/cli-service')
console.log(process.env.PUBLIC_PATH)

module.exports = defineConfig({
  transpileDependencies: true,
  outputDir: process.env.OUT_PUT_DIR,
  publicPath: process.env.PUBLIC_PATH
})
