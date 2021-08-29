const development = require("./development");
const staging = require("./staging");
const test = require("./test");
const production = require("./production");

module.exports = {
  development: development,
  staging: staging,
  test: test,
  production: production,
};
