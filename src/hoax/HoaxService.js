const Hoax = require("./Hoax");
const User = require("../user/User");
const FileAttachment = require("../file/FileAttachment");
const FileService = require("../file/FileService");
const NotFoundException = require("../error/NotFoundException");

const save = async (body, user) => {
  const hoax = {
    content: body.content,
    timestamp: Date.now(),
    userId: user.id,
  };
  const { id } = await Hoax.create(hoax);
  if (body.fileAttachment) {
    await FileService.asscoiateFileToHoax(body.fileAttachment, id);
  }
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
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "username", "email", "image"],
      },
      {
        model: FileAttachment,
        as: "fileAttachment",
        attributes: ["filename", "fileType"],
      },
    ],
    order: [["id", "DESC"]],
    limit: size,
    offset: page * size,
  });

  return {
    content: HoaxesWithCount.rows.map((hoaxSequelize) => {
      const hoaxAsJson = hoaxSequelize.get({ plain: true });
      if (hoaxAsJson.fileAttachment === null) {
        delete hoaxAsJson.fileAttachment;
      }
      return hoaxAsJson;
    }),
    page: page,
    size: size,
    totalPages: Math.ceil(HoaxesWithCount.count / size),
  };
};

module.exports = { save, getHoaxes };
