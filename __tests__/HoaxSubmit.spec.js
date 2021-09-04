const request = require("supertest");
const app = require("../src/app");
const en = require("../locales/en/translation.json");
const hk = require("../locales/hk/translation.json");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const bcrypt = require("bcrypt");
const Hoax = require("../src/hoax/Hoax");

beforeAll(async () => {
  if (process.env.NODE_ENV === "test") {
    await sequelize.sync();
  }
});

beforeEach(async () => {
  await Hoax.destroy({ truncate: true });
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

describe("Authentication", () => {
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
});
