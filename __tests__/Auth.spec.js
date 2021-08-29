const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const bcrypt = require("bcrypt");
const Token = require("../src/auth/Token");
const en = require("../locales/en/translation.json");
const hk = require("../locales/hk/translation.json");

beforeAll(async () => {
  if (process.env.NODE_ENV === "test") {
    await sequelize.sync();
  }
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

const postAuthentication = async (credentials, options = {}) => {
  const agent = request(app).post("/api/1.0/auth");
  if (options.language) {
    agent.set("Accept-Language", options.language);
  }
  return await agent.send(credentials);
};

const postLogout = (options = {}) => {
  const agent = request(app).post("/api/1.0/logout");
  if (options.token) {
    agent.set("Authorization", `Bearer ${options.token}`);
  }
  return agent.send();
};

describe("Authentication", () => {
  it("returns 200 when credentials are correct", async () => {
    await addUser();
    const response = await postAuthentication({ email: "user1@mail.com", password: "P4ssword" });
    expect(response.status).toBe(200);
  });
  it("returns only user id, username, image and token when login success", async () => {
    const user = await addUser();
    const response = await postAuthentication({ email: "user1@mail.com", password: "P4ssword" });
    expect(response.body.id).toBe(user.id);
    expect(response.body.username).toBe(user.username);
    expect(Object.keys(response.body)).toEqual(["id", "username", "image", "token"]);
  });
  it("returns 401 when credentials are correct", async () => {
    const response = await postAuthentication({ email: "user1@mail.com", password: "P4ssword" });
    expect(response.status).toBe(401);
  });
  it("returns proper error body when authentication fails", async () => {
    const nowInMillis = new Date().getTime();
    const response = await postAuthentication({ email: "user1@mail.com", password: "P4ssword" });
    const error = response.body;
    expect(error.path).toBe("/api/1.0/auth");
    expect(error.timestamp).toBeGreaterThan(nowInMillis);
    expect(Object.keys(error)).toEqual(["path", "timestamp", "message"]);
  });

  it.each`
    language | message
    ${"hk"}  | ${hk.authentication_failure}
    ${"en"}  | ${en.authentication_failure}
  `("return $message for unknow user when leanguage is $language", async ({ language, message }) => {
    const response = await postAuthentication({ email: "user1@mail.com", password: "P4ssword" }, { language });
    expect(response.body.message).toBe(message);
  });

  it("returns 401 when password is wrong", async () => {
    await addUser();
    const response = await postAuthentication({ email: "user1@mail.com", password: "aaaaaaaaa" });
    expect(response.status).toBe(401);
  });
  it("returns 403 when logging in with an inactive account", async () => {
    await addUser({ ...activeUser, inactive: true });
    const response = await postAuthentication({ email: "user1@mail.com", password: "P4ssword" });
    expect(response.status).toBe(403);
  });
  it("returns proper error body when inactive authentication fails", async () => {
    await addUser({ ...activeUser, inactive: true });
    const nowInMillis = new Date().getTime();
    const response = await postAuthentication({ email: "user1@mail.com", password: "P4ssword" });
    const error = response.body;
    expect(error.path).toBe("/api/1.0/auth");
    expect(error.timestamp).toBeGreaterThan(nowInMillis);
    expect(Object.keys(error)).toEqual(["path", "timestamp", "message"]);
  });
  it.each`
    language | message
    ${"hk"}  | ${hk.inactive_authentication_failure}
    ${"en"}  | ${en.inactive_authentication_failure}
  `("return $message for unknow user when leanguage is $language", async ({ language, message }) => {
    await addUser({ ...activeUser, inactive: true });
    const response = await postAuthentication({ email: "user1@mail.com", password: "P4ssword" }, { language });
    expect(response.body.message).toBe(message);
  });
  it("returns 401 when email is not valid", async () => {
    await addUser();
    const response = await postAuthentication({ password: "P4ssword" });
    expect(response.status).toBe(401);
  });
  it("returns 401 when password is not valid", async () => {
    await addUser();
    const response = await postAuthentication({ email: "user1@mail.com" });
    expect(response.status).toBe(401);
  });
  it("returns token in response body when credentials are correct", async () => {
    await addUser();
    const response = await postAuthentication({ email: "user1@mail.com", password: "P4ssword" });
    expect(response.body.token).not.toBeUndefined();
  });
});

describe("Logout", () => {
  it("returns 200 when unauthorized request send for logout", async () => {
    const response = await postLogout();
    expect(response.status).toBe(200);
  });
  it("remove the token from database", async () => {
    await addUser();
    const response = await postAuthentication({ email: "user1@mail.com", password: "P4ssword" });
    const token = response.body.token;
    await postLogout({ token });
    const storedToken = await Token.findOne({ where: { token } });
    expect(storedToken).toBeNull();
  });
});

describe("Token Expiration", () => {
  const putUser = async (id = 5, body = null, options = {}) => {
    let agent = request(app);

    agent = request(app).put("/api/1.0/users/" + id);
    if (options.token) {
      agent.set("Authorization", `Bearer ${options.token}`);
    }
    return agent.send(body);
  };

  it("returns 403 when token is older than 1 week", async () => {
    const savedUser = await addUser();
    const token = "test-token";
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1);
    await Token.create({
      token: token,
      userId: savedUser.id,
      lastUsedAt: oneWeekAgo,
    });

    const vaildUpdate = { username: "user1-updated" };
    const response = await putUser(savedUser.id, vaildUpdate, { token: token });
    expect(response.status).toBe(403);
  });

  it("refreshes lastUsedAt when unexpired token is used", async () => {
    const savedUser = await addUser();
    const token = "test-token";
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    await Token.create({
      token: token,
      userId: savedUser.id,
      lastUsedAt: fourDaysAgo,
    });

    const vaildUpdate = { username: "user1-updated" };
    const rightBeforeSendingRequest = new Date();
    await putUser(savedUser.id, vaildUpdate, { token: token });
    const tokenInDB = await Token.findOne({ where: { token: token } });
    expect(tokenInDB.lastUsedAt.getTime()).toBeGreaterThan(rightBeforeSendingRequest.getTime());
  });

  it("refreshes lastUsedAt when unexpired token is used for unauthenticated endpoint", async () => {
    const savedUser = await addUser();
    const token = "test-token";
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    await Token.create({
      token: token,
      userId: savedUser.id,
      lastUsedAt: fourDaysAgo,
    });

    const rightBeforeSendingRequest = new Date();
    await request(app).get("/api/1.0/users/5").set("Authorization", `Bearer ${token}`);
    const tokenInDB = await Token.findOne({ where: { token: token } });
    expect(tokenInDB.lastUsedAt.getTime()).toBeGreaterThan(rightBeforeSendingRequest.getTime());
  });
});
