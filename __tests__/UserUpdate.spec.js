const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const bcrypt = require("bcrypt");
const en = require("../locales/en/translation.json");
const hk = require("../locales/hk/translation.json");
const fs = require("fs");
const path = require("path");

beforeAll(async () => {
  await sequelize.sync();
});

beforeEach(() => {
  return User.destroy({ truncate: { cascade: true } });
});

const activeUser = {
  username: "user1",
  email: "user1@mail.com",
  password: "P4ssword",
  inactive: false,
};

const addUser = async (user = { ...activeUser }) => {
  const hash = await bcrypt.hash(user.password, 10);
  user.password = hash;
  return await User.create(user);
};

const putUser = async (id = 5, body = null, options = {}) => {
  let agent = request(app);

  let token;
  if (options.auth) {
    const response = await agent.post("/api/1.0/auth").send(options.auth);
    token = response.body.token;
  }

  agent = request(app).put("/api/1.0/users/" + id);
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

describe("User Update", () => {
  it("returns forbidden when request sent without basic authorization", async () => {
    const response = await putUser();
    expect(response.status).toBe(403);
  });

  it.each`
    language | message
    ${"hk"}  | ${hk.unauthroized_user_update}
    ${"en"}  | ${en.unauthroized_user_update}
  `(
    "return error body with $message for unauthroized request when language is $language",
    async ({ language, message }) => {
      const nowInMillis = new Date().getTime();
      const response = await putUser(5, null, { language });

      expect(response.body.path).toBe("/api/1.0/users/5");
      expect(response.body.timestamp).toBeGreaterThan(nowInMillis);
      expect(response.body.message).toBe(message);
    }
  );

  it("returns forbidden when request sent with incorrect email in basic authorization", async () => {
    await addUser();
    const response = await putUser(5, null, { auth: { email: "user1000@mail.com", password: "P4ssword" } });
    expect(response.status).toBe(403);
  });

  it("returns forbidden when request sent with incorrect password in basic authorization", async () => {
    await addUser();
    const response = await putUser(5, null, { auth: { email: "user1@mail.com", password: "Password" } });
    expect(response.status).toBe(403);
  });

  it("returns forbidden when update request sent with correct credential but for different user", async () => {
    await addUser();
    const userToBeUpdated = await addUser({ ...activeUser, username: "user2", email: "user2@mail.com" });
    const response = await putUser(userToBeUpdated.id, null, {
      auth: { email: "user1@mail.com", password: "P4ssword" },
    });
    expect(response.status).toBe(403);
  });

  it("returns forbidden when update request sent with inactive user with correct credential for its own user", async () => {
    const inactiveUser = await addUser({ ...activeUser, inactive: true });
    const response = await putUser(inactiveUser.id, null, { auth: { email: "user1@mail.com", password: "P4ssword" } });
    expect(response.status).toBe(403);
  });

  it("returns 200 ok when valid update request sent from authorized user", async () => {
    const savedUser = await addUser();
    const vaildUpdate = { username: "user1-updated" };
    const response = await putUser(savedUser.id, vaildUpdate, {
      auth: { email: savedUser.email, password: activeUser.password },
    });
    expect(response.status).toBe(200);
  });

  it("updates username in database when valid update request sent from authorized user", async () => {
    const savedUser = await addUser();
    const vaildUpdate = { username: "user1-updated" };
    await putUser(savedUser.id, vaildUpdate, {
      auth: { email: savedUser.email, password: activeUser.password },
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    expect(inDBUser.username).toBe(vaildUpdate.username);
  });

  it("returns 403 when token is not valid", async () => {
    const response = await putUser(5, null, { token: "123" });
    expect(response.status).toBe(403);
  });

  it("saves the user image when update contains image as base64", async () => {
    const filePath = path.join(".", "__tests__", "resources", "test-png.png");
    const fileInBase64 = fs.readFileSync(filePath, { encoding: "base64" });
    const savedUser = await addUser();
    const vaildUpdate = { username: "user1-updated", image: fileInBase64 };
    await putUser(savedUser.id, vaildUpdate, {
      auth: { email: savedUser.email, password: activeUser.password },
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    expect(inDBUser.image).toBeTruthy();
  });
});
