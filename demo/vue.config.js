const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  publicPath:process.env.PUBLIC_PATH,
  transpileDependencies: true
})
