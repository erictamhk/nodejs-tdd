const fs = require("fs");
const path = require("path");
const config = require("config");
const { randomString } = require("../shared/generator");
const FileType = require("file-type");
const FileAttachment = require("./FileAttachment");

const { uploadDir, profileDir, attachmentDir } = config;
const profileFolder = path.join(".", uploadDir, profileDir);
const attachmentFolder = path.join(".", uploadDir, attachmentDir);

const createFolders = () => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }
  if (!fs.existsSync(profileFolder)) {
    fs.mkdirSync(profileFolder);
  }
  if (!fs.existsSync(attachmentFolder)) {
    fs.mkdirSync(attachmentFolder);
  }
};

const saveProfileImage = async (base64File) => {
  const filename = randomString(32);
  const filePath = path.join(profileFolder, filename);
  await fs.promises.writeFile(filePath, base64File, { encoding: "base64" });
  return filename;
};

const deleteProfileImage = async (filename) => {
  const filePath = path.join(profileFolder, filename);
  await fs.promises.unlink(filePath);
};

const isLessThen2MB = (buffer) => {
  return buffer.length <= 2 * 1024 * 1024;
};

const isSupportedFileType = async (buffer) => {
  const type = await FileType.fromBuffer(buffer);
  return !type ? false : type.mime === "image/png" || type.mime === "image/jpeg";
};

const saveAttachment = async (file) => {
  const filename = randomString(32);
  const filePath = path.join(attachmentFolder, filename);
  await fs.promises.writeFile(filePath, file.buffer);
  await FileAttachment.create({ filename: filename, uploadDate: new Date() });
  return filename;
};

module.exports = {
  createFolders,
  saveProfileImage,
  deleteProfileImage,
  isLessThen2MB,
  isSupportedFileType,
  saveAttachment,
};
