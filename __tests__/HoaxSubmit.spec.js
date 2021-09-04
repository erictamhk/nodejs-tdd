const request = require("supertest");
const bcrypt = require("bcrypt");
const path = require("path");
const app = require("../src/app");
const User = require("../src/user/User");
const Hoax = require("../src/hoax/Hoax");
const FileAttachment = require("../src/file/FileAttachment");
const sequelize = require("../src/config/database");
const en = require("../locales/en/translation.json");
const hk = require("../locales/hk/translation.json");

beforeAll(async () => {
  if (process.env.NODE_ENV === "test") {
    await sequelize.sync();
  }
});

beforeEach(async () => {
  await FileAttachment.destroy({ truncate: true });
  await User.destroy({ truncate: { cascade: true } });
});

const activeUser = {
  username: "user1",
  email: "user1@mail.com",
  password: "P4ssword",
  inactive: false,
};

const credentials = { email: activeUser.email, password: activeUser.password };

const vaildContent = "Hoax content";

const uploadFile = (file = "test-png.png", options = {}) => {
  const filePath = path.join(".", "__tests__", "resources", file);
  const agent = request(app).post("/api/1.0/hoaxes/attachments");
  if (options.language) {
    agent.set("Accept-Language", options.language);
  }
  return agent.attach("file", filePath);
};

const addUser = async (user = { ...activeUser }) => {
  const hash = await bcrypt.hash(user.password, 10);
  user.password = hash;
  return await User.create(user);
};

const postHoax = async (body = null, options = {}) => {
  let agent = request(app);

  let token;
  if (options.auth) {
    const response = await agent.post("/api/1.0/auth").send(options.auth);
    token = response.body.token;
  }

  agent = request(app).post("/api/1.0/hoaxes");
  if (options.language) {
    agent.set("Accept-Language", options.language);
  }
  if (token) {
    agent.set("Authorization", `Bearer ${token}`);
  }
  if (options.token) {
    agent.set("Authorization", `Bearer ${options.token}`);
  }
  return agent.send(body);
};

describe("Post Hoax", () => {
  it("returns 401 when hoax post request has no authentication", async () => {
    const response = await postHoax();
    expect(response.status).toBe(401);
  });
  it.each`
    language | message
    ${"hk"}  | ${hk.unauthroized_hoax_submit}
    ${"en"}  | ${en.unauthroized_hoax_submit}
  `(
    "return error body with $message when unauthorized request send with language is $language",
    async ({ language, message }) => {
      const nowInMillis = new Date().getTime();
      const response = await postHoax(null, { language: language });

      expect(response.body.path).toBe("/api/1.0/hoaxes");
      expect(response.body.timestamp).toBeGreaterThan(nowInMillis);
      expect(response.body.message).toBe(message);
    }
  );
  it("returns 200 when valid hoax submitted with authorized user", async () => {
    await addUser();
    const response = await postHoax({ content: vaildContent }, { auth: credentials });
    expect(response.status).toBe(200);
  });
  it("saves the hoax to database when authorized user send valid request", async () => {
    await addUser();
    await postHoax({ content: vaildContent }, { auth: credentials });
    const hoaxes = await Hoax.findAll();
    expect(hoaxes.length).toBe(1);
  });
  it("saves the hoax content and timestamp to database", async () => {
    await addUser();
    const beforeSubmit = Date.now();
    await postHoax({ content: vaildContent }, { auth: credentials });
    const hoaxes = await Hoax.findAll();
    const savedHoax = hoaxes[0];
    expect(savedHoax.content).toBe(vaildContent);
    expect(savedHoax.timestamp).toBeGreaterThan(beforeSubmit);
    expect(savedHoax.timestamp).toBeLessThan(Date.now());
  });
  it.each`
    language | message
    ${"hk"}  | ${hk.hoax_submit_success}
    ${"en"}  | ${en.hoax_submit_success}
  `("return $message to success submit when language is $language", async ({ language, message }) => {
    await addUser();
    const response = await postHoax({ content: vaildContent }, { language: language, auth: credentials });
    expect(response.body.message).toBe(message);
  });
  it.each`
    language | message
    ${"hk"}  | ${hk.validation_failure}
    ${"en"}  | ${en.validation_failure}
  `(
    "return 400 and $message when hoax content is less than 10 characters when language is $language",
    async ({ language, message }) => {
      await addUser();
      const response = await postHoax({ content: "123456789" }, { language: language, auth: credentials });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe(message);
    }
  );
  it("returns validation error body when an invalid hoax post by authorized user", async () => {
    await addUser();
    const nowInMillis = new Date().getTime();
    const response = await postHoax({ content: "123456789" }, { auth: credentials });

    const error = response.body;
    expect(error.path).toBe("/api/1.0/hoaxes");
    expect(error.timestamp).toBeGreaterThan(nowInMillis);
    expect(Object.keys(error)).toEqual(["path", "timestamp", "message", "validationErrors"]);
  });
  it.each`
    language | content             | contentForDescription | message
    ${"hk"}  | ${null}             | ${"null"}             | ${hk.hoax_content_size}
    ${"hk"}  | ${"a".repeat(9)}    | ${"short"}            | ${hk.hoax_content_size}
    ${"hk"}  | ${"a".repeat(5001)} | ${"very long"}        | ${hk.hoax_content_size}
    ${"en"}  | ${null}             | ${"null"}             | ${en.hoax_content_size}
    ${"en"}  | ${"a".repeat(9)}    | ${"short"}            | ${en.hoax_content_size}
    ${"en"}  | ${"a".repeat(5001)} | ${"very long"}        | ${en.hoax_content_size}
  `(
    "return $message when content is $contentForDescription and the language is $language",
    async ({ language, content, message }) => {
      await addUser();
      const response = await postHoax({ content: content }, { language: language, auth: credentials });
      expect(response.body.validationErrors.content).toBe(message);
    }
  );
  it("stores hoax owner id in database", async () => {
    const user = await addUser();
    await postHoax({ content: vaildContent }, { auth: credentials });
    const hoaxes = await Hoax.findAll();
    const savedHoax = hoaxes[0];
    expect(savedHoax.userId).toBe(user.id);
  });
  it("associates hoax with attachment in database", async () => {
    const uploadResponse = await uploadFile();
    const uploadedFileId = uploadResponse.body.id;
    console.log(uploadedFileId);
    await addUser();
    await postHoax({ content: vaildContent, fileAttachment: uploadedFileId }, { auth: credentials });

    const hoaxes = await Hoax.findAll();
    const savedHoax = hoaxes[0];

    const attachmentInDb = await FileAttachment.findOne({ where: { id: uploadedFileId } });
    expect(attachmentInDb.hoaxId).toBe(savedHoax.id);
  });
  it("returns 200 ok even the attachment does not exist", async () => {
    await addUser();
    const response = await postHoax({ content: vaildContent, fileAttachment: 1000 }, { auth: credentials });
    expect(response.status).toBe(200);
  });
  it("keeps the old associated hoax when new hoax submitted with old attachment id", async () => {
    const uploadResponse = await uploadFile();
    const uploadedFileId = uploadResponse.body.id;
    console.log(uploadedFileId);
    await addUser();
    await postHoax({ content: vaildContent, fileAttachment: uploadedFileId }, { auth: credentials });
    const attachment = await FileAttachment.findOne({ where: { id: uploadedFileId } });

    await postHoax({ content: vaildContent + " 2", fileAttachment: uploadedFileId }, { auth: credentials });
    const attachmentAfterSecondPost = await FileAttachment.findOne({ where: { id: uploadedFileId } });

    expect(attachment.hoaxId).toBe(attachmentAfterSecondPost.hoaxId);
  });
});
