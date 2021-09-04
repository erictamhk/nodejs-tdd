const Hoax = require("./Hoax");
const User = require("../user/User");

const save = async (body, user) => {
  const hoax = {
    content: body.content,
    timestamp: Date.now(),
    userId: user.id,
  };
  await Hoax.create(hoax);
};

const getHoaxes = async (page, size) => {
  const HoaxesWithCount = await Hoax.findAndCountAll({
    attributes: ["id", "content", "timestamp"],
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
