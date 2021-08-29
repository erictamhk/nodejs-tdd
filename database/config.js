const profiles = require("../config");

const dbConfig = {};

Object.keys(profiles).forEach((profile) => {
  dbConfig[profile] = { ...profiles[profile].database };
});

module.exports = dbConfig;
