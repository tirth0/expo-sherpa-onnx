const { defineConfig } = require("eslint/config");
const nativeConfig = require("eslint-config-universe/flat/native");
const webConfig = require("eslint-config-universe/flat/web");

module.exports = defineConfig([
  nativeConfig,
  webConfig,
  { ignores: ["build/"] },
]);
