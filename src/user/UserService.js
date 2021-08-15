const User = require("./User");
const bcrypt = require("bcrypt");
const EmailService = require("../email/EmailService");
const Sequelize = require("sequelize");
const sequelize = require("../config/database");
const EmailException = require("../email/EmailException");
const InvalidTokenException = require("./InvalidTokenException");
const NotFoundException = require("../error/NotFoundException");
const { randomString } = require("../shared/generator");

const save = async (body) => {
  const hash = await bcrypt.hash(body.password, 10);

  const user = {
    username: body.username,
    email: body.email,
    password: hash,
    activationToken: randomString(16),
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

const getUsers = async (page, size, authenticatedUser) => {
  const { rows: users, count: userCount } = await User.findAndCountAll({
    where: {
      inactive: false,
      id: {
        [Sequelize.Op.not]: authenticatedUser ? authenticatedUser.id : 0,
      },
    },
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
    throw new NotFoundException("user_not_found");
  }
  return user;
};

const updateUser = async (id, updatedBody) => {
  const user = await User.findOne({ where: { id: id } });
  user.username = updatedBody.username;
  await user.save();
};

const deleteUser = async (id) => {
  await User.destroy({ where: { id: id } });
};

module.exports = { save, findByEmail, activate, getUsers, getUser, updateUser, deleteUser };
