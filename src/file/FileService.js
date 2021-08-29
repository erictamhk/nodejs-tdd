const fs = require("fs");

const createFolders = () => {
  const uploadDir = "upload";
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync("upload");
  }
};

module.exports = { createFolders };
