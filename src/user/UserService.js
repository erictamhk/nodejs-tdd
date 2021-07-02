const User = require("./User");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const EmailService = require("../email/EmailService");

const generateToken = (length) => {
  return crypto.randomBytes(length).toString("hex").substring(0, length);
};

const save = async (body) => {
  const hash = await bcrypt.hash(body.password, 10);

  const user = {
    username: body.username,
    email: body.email,
    password: hash,
    activationToken: generateToken(16),
  };

  await User.create(user);
  await EmailService.sendAccountActivation(user.email, user.activationToken);
};

const findByEmail = async (email) => {
  return await User.findOne({ where: { email: email } });
};

module.exports = { save, findByEmail };
