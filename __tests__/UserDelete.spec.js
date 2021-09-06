const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const Token = require("../src/auth/Token");
const Hoax = require("../src/hoax/Hoax");
const FileAttachment = require("../src/file/FileAttachment");
const bcrypt = require("bcrypt");
const en = require("../locales/en/translation.json");
const hk = require("../locales/hk/translation.json");

const fs = require("fs");
const path = require("path");
const config = require("config");

const { uploadDir, profileDir, attachmentDir } = config;
const profileFolder = path.join(".", uploadDir, profileDir);
const attachmentFolder = path.join(".", uploadDir, attachmentDir);

const testFilePath = path.join(".", "__tests__", "resources", "test-png.png");

beforeEach(() => {
  return User.destroy({ truncate: { cascade: true } });
});

const activeUser = {
  username: "user1",
  email: "user1@mail.com",
  password: "P4ssword",
  inactive: false,
};

const credentials = { email: activeUser.email, password: activeUser.password };

const addUser = async (user = { ...activeUser }) => {
  const hash = await bcrypt.hash(user.password, 10);
  user.password = hash;
  return await User.create(user);
};

const auth = async (options = {}) => {
  let token;
  if (options.auth) {
    const response = await request(app).post("/api/1.0/auth").send(options.auth);
    token = response.body.token;
  }
  return token;
};

const deleteUser = async (id = 5, options = {}) => {
  const agent = request(app).delete("/api/1.0/users/" + id);
  if (options.language) {
    agent.set("Accept-Language", options.language);
  }
  if (options.token) {
    agent.set("Authorization", `Bearer ${options.token}`);
  }
  return agent.send();
};

const addFileAttachment = async (filename) => {
  return await FileAttachment.create({
    filename: filename,
  });
};

describe("User Delete", () => {
  it("returns forbidden when request sent unauthorized", async () => {
    const response = await deleteUser();
    expect(response.status).toBe(403);
  });

  it.each`
    language | message
    ${"hk"}  | ${hk.unauthroized_user_delete}
    ${"en"}  | ${en.unauthroized_user_delete}
  `(
    "return error body with $message for unauthroized request when language is $language",
    async ({ language, message }) => {
      const nowInMillis = new Date().getTime();
      const response = await deleteUser(5, { language });

      expect(response.body.path).toBe("/api/1.0/users/5");
      expect(response.body.timestamp).toBeGreaterThan(nowInMillis);
      expect(response.body.message).toBe(message);
    }
  );

  it("returns forbidden when delete request sent with correct credential but for different user", async () => {
    await addUser();
    const userToBeDeleted = await addUser({ ...activeUser, username: "user2", email: "user2@mail.com" });
    const token = await auth({ auth: credentials });
    const response = await deleteUser(userToBeDeleted.id, { token });
    expect(response.status).toBe(403);
  });

  it("returns 403 when token is not valid", async () => {
    const response = await deleteUser(5, { token: "123" });
    expect(response.status).toBe(403);
  });

  it("returns 200 ok when valid update request sent from authorized user", async () => {
    const savedUser = await addUser();
    const token = await auth({ auth: credentials });
    const response = await deleteUser(savedUser.id, {
      token,
    });
    expect(response.status).toBe(200);
  });

  it("delete user from database when request sent from authorized user", async () => {
    const savedUser = await addUser();
    const token = await auth({ auth: credentials });
    await deleteUser(savedUser.id, {
      token,
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    expect(inDBUser).toBeNull();
  });

  it("delete token from database when delete user request sent from authorized user", async () => {
    const savedUser = await addUser();
    const token = await auth({ auth: credentials });
    await deleteUser(savedUser.id, {
      token,
    });
    const tokenInDB = await Token.findOne({ where: { token: token } });
    expect(tokenInDB).toBeNull();
  });

  it("delete all tokens from database when delete user request sent from authorized user", async () => {
    const savedUser = await addUser();
    const token1 = await auth({ auth: credentials });
    const token2 = await auth({ auth: credentials });
    await deleteUser(savedUser.id, {
      token: token1,
    });
    const tokenInDB = await Token.findOne({ where: { token: token2 } });
    expect(tokenInDB).toBeNull();
  });

  it("delete hoax from database when delete user request sent from authorized user", async () => {
    const savedUser = await addUser();
    const token = await auth({ auth: credentials });

    await request(app)
      .post("/api/1.0/hoaxes")
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Hoax content" });

    await deleteUser(savedUser.id, {
      token: token,
    });
    const hoaxes = await Hoax.findAll();
    expect(hoaxes.length).toBe(0);
  });

  it("removes profile image when user is deleted", async () => {
    const user = await addUser();
    const token = await auth({ auth: credentials });
    const storedFileName = "profile-image-for-user1";
    const targetPath = path.join(profileFolder, storedFileName);
    fs.copyFileSync(testFilePath, targetPath);
    user.image = storedFileName;
    await user.save();

    await deleteUser(user.id, {
      token: token,
    });
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it("delete hoax attachment from storage and database when delete user request sent from authorized user", async () => {
    const savedUser = await addUser();
    const token = await auth({ auth: credentials });
    const storedFileName = "profile-attachment-for-user1";
    const attachment = await addFileAttachment(storedFileName);

    const targetPath = path.join(attachmentFolder, storedFileName);
    fs.copyFileSync(testFilePath, targetPath);
    await request(app)
      .post("/api/1.0/hoaxes")
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Hoax content", fileAttachment: attachment.id });

    await deleteUser(savedUser.id, {
      token: token,
    });

    const storedAttachmentAfterDelete = await FileAttachment.findOne({ where: { id: attachment.id } });
    expect(storedAttachmentAfterDelete).toBeNull();
    expect(fs.existsSync(targetPath)).toBe(false);
  });
});
