const jwt = require("jsonwebtoken");
const secret = "this-is-our-secret";

const createToken = (user) => {
  return jwt.sign({ id: user.id }, secret);
};

const verify = (token) => {
  return jwt.verify(token, secret);
};

module.exports = { createToken, verify };
