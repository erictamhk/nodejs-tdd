const app = require("./src/app");
const sequelize = require("./src/config/database");
const TokenService = require("./src/auth/TokenService");
const FileService = require("./src/file/FileService");
const logger = require("./src/shared/logger");

sequelize.sync();

TokenService.scheduleCleanup();
FileService.removeUnusedAttachment();

app.listen(3000, () => logger.info("app is running. version: " + process.env.npm_package_version));
