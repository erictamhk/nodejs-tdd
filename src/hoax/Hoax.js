const Sequelize = require("sequelize");
const sequelize = require("../config/database");
const FileAttachment = require("../file/FileAttachment");

const Model = Sequelize.Model;

class Hoax extends Model {}

Hoax.init(
  {
    content: {
      type: Sequelize.STRING,
    },
    timestamp: {
      type: Sequelize.BIGINT,
    },
  },
  {
    sequelize,
    modelName: "hoax",
    timestamps: false,
  }
);

Hoax.hasOne(FileAttachment, { onDelete: "cascade", foreignKey: "hoaxId" });
FileAttachment.belongsTo(Hoax);

module.exports = Hoax;
