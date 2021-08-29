const FileService = require("../src/file/FileService");
const fs = require("fs");
const path = require("path");

describe("createFolders", () => {
  it("creates upload folder", () => {
    FileService.createFolders();
    const folderName = "upload";
    expect(fs.existsSync(folderName)).toBe(true);
  });
});
