const User = require("./User");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const EmailService = require("../email/EmailService");
const sequelize = require("../config/database");
const EmailException = require("../email/EmailException");
const InvalidTokenException = require("./InvalidTokenException");
const UserNotFoundException = require("./UserNotFoundException");

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

  const transaction = await sequelize.transaction();

  await User.create(user, { transaction });
  try {
    await EmailService.sendAccountActivation(user.email, user.activationToken);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw new EmailException();
  }
};

const findByEmail = async (email) => {
  return await User.findOne({ where: { email: email } });
};

const activate = async (token) => {
  const user = await User.findOne({ where: { activationToken: token } });
  if (!user) {
    throw new InvalidTokenException();
  }
  user.inactive = false;
  user.activationToken = null;
  await user.save();
};

const getUsers = async (page, size) => {
  const { rows: users, count: userCount } = await User.findAndCountAll({
    where: { inactive: false },
    attributes: ["id", "username", "email"],
    limit: size,
    offset: page * size,
  });

  return {
    content: users,
    page: page,
    size: size,
    totalPages: Math.ceil(userCount / size),
  };
};

const getUser = async (id) => {
  const user = await User.findOne({ where: { id: id, inactive: false }, attributes: ["id", "username", "email"] });
  if (!user) {
    throw new UserNotFoundException();
  }
  return user;
};

module.exports = { save, findByEmail, activate, getUsers, getUser };
