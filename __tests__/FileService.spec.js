const FileService = require("../src/file/FileService");
const fs = require("fs");
const path = require("path");
const config = require("config");
const FileAttachment = require("../src/file/FileAttachment");
const Hoax = require("../src/hoax/Hoax");
const User = require("../src/user/User");

const { uploadDir, profileDir, attachmentDir } = config;
const profileFolder = path.join(".", uploadDir, profileDir);
const attachmentFolder = path.join(".", uploadDir, attachmentDir);

describe("createFolders", () => {
  it("creates upload folder", () => {
    FileService.createFolders();
    expect(fs.existsSync(uploadDir)).toBe(true);
  });
  it("creates profile folder under upload folder", () => {
    FileService.createFolders();
    expect(fs.existsSync(profileFolder)).toBe(true);
  });
  it("creates attachments folder under upload folder", () => {
    FileService.createFolders();
    expect(fs.existsSync(attachmentFolder)).toBe(true);
  });
});

describe("Scheduled unused file clean up", () => {
  const filename = "test-file" + Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const testPath = path.join(".", "__tests__", "resources", "test-png.png");
  const targetPath = path.join(attachmentFolder, filename);

  const delay = function (s) {
    return new Promise(function (resolve) {
      setTimeout(resolve, s);
    });
  };

  beforeEach(async () => {
    await FileAttachment.destroy({ truncate: true });
    await User.destroy({ truncate: { cascade: true } });
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  });

  const addHoax = async () => {
    const user = await User.create({
      username: `user1`,
      email: `user1@mail.com`,
    });
    const hoax = await Hoax.create({
      content: `Hoax content 1`,
      timestamp: Date.now(),
      userId: user.id,
    });

    return hoax.id;
  };

  it("removes the 24 hours old file with attachment entry if not used hoax", async () => {
    jest.useFakeTimers();
    fs.copyFileSync(testPath, targetPath);
    const uploadDate = new Date(Date.now() - ONE_DAY - 1000);
    const attachment = await FileAttachment.create({
      filename: filename,
      uploadDate: uploadDate,
    });
    FileService.removeUnusedAttachment();
    jest.advanceTimersByTime(ONE_DAY + 5000);
    jest.useRealTimers();
    await delay(500);
    const attachmentAfterRemove = await FileAttachment.findOne({ where: { id: attachment.id } });
    expect(attachmentAfterRemove).toBeNull();
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it("keeps the files younger than 24 hours and their database entry event not associated with hoax", async () => {
    jest.useFakeTimers();
    fs.copyFileSync(testPath, targetPath);
    const uploadDate = new Date(Date.now() + 1);
    const attachment = await FileAttachment.create({
      filename: filename,
      uploadDate: uploadDate,
    });
    FileService.removeUnusedAttachment();
    jest.advanceTimersByTime(ONE_DAY + 5000);
    jest.useRealTimers();
    await delay(500);
    const attachmentAfterRemove = await FileAttachment.findOne({ where: { id: attachment.id } });
    expect(attachmentAfterRemove).not.toBeNull();
    expect(fs.existsSync(targetPath)).toBe(true);
  });

  it("keeps the files older than 24 hours and their database entry if associated with hoax", async () => {
    jest.useFakeTimers();
    fs.copyFileSync(testPath, targetPath);
    const id = await addHoax();
    const uploadDate = new Date(Date.now() - ONE_DAY - 1000);
    const attachment = await FileAttachment.create({
      filename: filename,
      uploadDate: uploadDate,
      hoaxId: id,
    });
    FileService.removeUnusedAttachment();
    jest.advanceTimersByTime(ONE_DAY + 5000);
    jest.useRealTimers();
    await delay(500);
    const attachmentAfterRemove = await FileAttachment.findOne({ where: { id: attachment.id } });
    expect(attachmentAfterRemove).not.toBeNull();
    expect(fs.existsSync(targetPath)).toBe(true);
  });
});
