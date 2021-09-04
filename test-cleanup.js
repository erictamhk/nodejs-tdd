const fs = require("fs");
const path = require("path");
const config = require("config");

const { uploadDir, profileDir, attachmentDir } = config;
const profileFolder = path.join(".", uploadDir, profileDir);
const attachmentFolder = path.join(".", uploadDir, attachmentDir);

const clearFolders = (folder) => {
  const files = fs.readdirSync(folder);
  for (const file of files) {
    fs.unlinkSync(path.join(folder, file));
  }
};

clearFolders(profileFolder);
clearFolders(attachmentFolder);
