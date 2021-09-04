const Hoax = require("./Hoax");
const User = require("../user/User");
const NotFoundException = require("../error/NotFoundException");

const save = async (body, user) => {
  const hoax = {
    content: body.content,
    timestamp: Date.now(),
    userId: user.id,
  };
  await Hoax.create(hoax);
};

const getHoaxes = async (page, size, userId) => {
  let where = {};
  if (userId) {
    const user = await User.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("user_not_found");
    }
    where = { userId: userId };
  }
  const HoaxesWithCount = await Hoax.findAndCountAll({
    attributes: ["id", "content", "timestamp"],
    where,
    include: {
      model: User,
      as: "user",
      attributes: ["id", "username", "email", "image"],
    },
    order: [["id", "DESC"]],
    limit: size,
    offset: page * size,
  });

  return {
    content: HoaxesWithCount.rows,
    page: page,
    size: size,
    totalPages: Math.ceil(HoaxesWithCount.count / size),
  };
};

module.exports = { save, getHoaxes };
