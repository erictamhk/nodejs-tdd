const { randomString } = require("../shared/generator");
const Token = require("../auth/Token");

const createToken = async (user) => {
  const token = randomString(32);
  await Token.create({
    token: token,
    userId: user.id,
  });
  return token;
};

const verify = async (token) => {
  const tokenInDB = await Token.findOne({
    where: { token: token },
  });
  const userId = tokenInDB.userId;
  return { id: userId };
};

const deleteToken = async (token) => {
  await Token.destroy({
    where: { token: token },
  });
};

const deleteTokenOfUser = async (userId) => {
  await Token.destroy({
    where: { userId: userId },
  });
};

module.exports = { createToken, verify, deleteToken, deleteTokenOfUser };
