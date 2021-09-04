const request = require("supertest");
const app = require("../src/app");
const path = require("path");
const FileAttachment = require("../src/file/FileAttachment");
const sequelize = require("../src/config/database");
const fs = require("fs");
const config = require("config");

const { uploadDir, attachmentDir } = config;
const attachmentFolder = path.join(".", uploadDir, attachmentDir);

beforeAll(async () => {
  if (process.env.NODE_ENV === "test") {
    await sequelize.sync();
  }
});

beforeEach(async () => {
  await FileAttachment.destroy({ truncate: true });
});

const uploadFile = (file = "test-png.png") => {
  const filePath = path.join(".", "__tests__", "resources", file);
  return request(app).post("/api/1.0/hoaxes/attachments").attach("file", filePath);
};

describe("Upload File for Hoax", () => {
  it("returns 200 ok after successful upload", async () => {
    const response = await uploadFile();
    expect(response.status).toBe(200);
  });
  it("saves dynamicFilename, uploadDate as attachment object in database", async () => {
    const beforeSubmit = Date.now();
    await uploadFile();
    const attachments = await FileAttachment.findAll();
    const attachment = attachments[0];
    expect(attachment.filename).not.toBe("test-png.png");
    expect(attachment.uploadDate.getTime()).toBeGreaterThan(beforeSubmit);
  });
  it("saves file to attachment folder", async () => {
    await uploadFile();
    const attachments = await FileAttachment.findAll();
    const attachment = attachments[0];
    const filePath = path.join(attachmentFolder, attachment.filename);
    expect(fs.existsSync(filePath)).toBe(true);
  });
  it.each`
    file              | fileType
    ${"test-gif.gif"} | ${"image/gif"}
    ${"test-pdf.pdf"} | ${"application/pdf"}
    ${"test-txt.txt"} | ${null}
    ${"test-png.png"} | ${"image/png"}
    ${"test-png"}     | ${"image/png"}
    ${"test-jpg.jpg"} | ${"image/jpeg"}
  `("saves fileType as $fileType in attachment object when $file is upload", async ({ file, fileType }) => {
    await uploadFile(file);
    const attachments = await FileAttachment.findAll();
    const attachment = attachments[0];
    expect(attachment.fileType).toBe(fileType);
  });
  it.each`
    file              | fileExtension
    ${"test-gif.gif"} | ${"gif"}
    ${"test-pdf.pdf"} | ${"pdf"}
    ${"test-txt.txt"} | ${null}
    ${"test-png.png"} | ${"png"}
    ${"test-png"}     | ${"png"}
    ${"test-jpg.jpg"} | ${"jpg"}
  `(
    "saves filename with $fileExtension in attachment object and stored object when $file is upload ",
    async ({ file, fileExtension }) => {
      await uploadFile(file);
      const attachments = await FileAttachment.findAll();
      const attachment = attachments[0];
      if (file === "test-txt.txt") {
        expect(attachment.filename.endsWith("txt")).toBe(false);
      } else {
        expect(attachment.filename.endsWith(fileExtension)).toBe(true);
      }
      const filePath = path.join(attachmentFolder, attachment.filename);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  );
});
