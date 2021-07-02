const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");

beforeAll(() => {
  return sequelize.sync();
});

beforeEach(() => {
  return User.destroy({ truncate: true });
});

const validUser = {
  username: "user1",
  email: "user1@mail.com",
  password: "P4ssword",
};

const postUser = (user = { ...validUser }, options = {}) => {
  const agent = request(app).post("/api/1.0/users");
  if (options.language) {
    agent.set("Accept-Language", options.language);
  }
  return agent.send(user);
};

describe("User Registration", () => {
  it("returns 200 OK when signup request is valid", async () => {
    const response = await postUser(validUser);
    expect(response.status).toBe(200);
  });

  it("returns success message when signup request is valid", async () => {
    const response = await postUser(validUser);
    expect(response.body.message).toBe("User created");
  });

  it("Save the User to database", async () => {
    await postUser(validUser);
    const userList = await User.findAll();
    expect(userList.length).toBe(1);
  });

  it("Save the username and email to database", async () => {
    await postUser(validUser);
    const userList = await User.findAll();
    const savedUser = userList[0];
    expect(savedUser.username).toBe("user1");
    expect(savedUser.email).toBe("user1@mail.com");
  });

  it("hashes the pawword in database", async () => {
    await postUser(validUser);
    const userList = await User.findAll();
    const savedUser = userList[0];
    expect(savedUser.password).not.toBe("P4ssword");
  });

  it("returns 400 when username is null", async () => {
    const response = await postUser({
      username: null,
      email: "user1@mail.com",
      password: "P4ssword",
    });
    expect(response.status).toBe(400);
  });

  it("returns validationError field in response body when validation error occurs", async () => {
    const response = await postUser({
      username: null,
      email: "user1@mail.com",
      password: "P4ssword",
    });
    const body = response.body;

    expect(body.validationErrors).not.toBeUndefined();
  });

  it("returns errors for both when username and email is null ", async () => {
    const response = await postUser({
      username: null,
      email: null,
      password: "P4ssword",
    });
    const body = response.body;

    expect(Object.keys(body.validationErrors)).toEqual(["username", "email"]);
  });

  const username_null = "Username cannot be null";
  const username_size = "Must have min 4 and max 32 characters";
  const email_null = "E-mail cannot be null";
  const email_invalid = "E-mail is not valid";
  const password_null = "Password cannot be null";
  const password_size = "Password must be at least 6 characters";
  const password_patern = "Password must have at least 1 uppercase, 1 lowercase letter and 1 number";
  const email_inuse = "E-mail in use";
  it.each`
    field         | value             | expectedMessage
    ${"username"} | ${null}           | ${username_null}
    ${"email"}    | ${null}           | ${email_null}
    ${"password"} | ${null}           | ${password_null}
    ${"username"} | ${"usr"}          | ${username_size}
    ${"username"} | ${"a".repeat(33)} | ${username_size}
    ${"email"}    | ${"abc.com"}      | ${email_invalid}
    ${"email"}    | ${"user.abc.com"} | ${email_invalid}
    ${"email"}    | ${"user@mail"}    | ${email_invalid}
    ${"password"} | ${"pads"}         | ${password_size}
    ${"password"} | ${"alllowercase"} | ${password_patern}
    ${"password"} | ${"ALLUPPERCASE"} | ${password_patern}
    ${"password"} | ${"lowerUPPER"}   | ${password_patern}
    ${"password"} | ${"lower44444"}   | ${password_patern}
    ${"password"} | ${"UPPER44444"}   | ${password_patern}
    ${"password"} | ${"1234567890"}   | ${password_patern}
  `("return $expectedMessage when $field is $value", async ({ field, expectedMessage, value }) => {
    const user = { ...validUser };
    user[field] = value;
    const response = await postUser(user);
    const body = response.body;
    expect(body.validationErrors[field]).toBe(expectedMessage);
  });

  it(`returns ${email_inuse} when same email is alreay in use`, async () => {
    await User.create({ ...validUser });
    const response = await postUser(validUser);
    expect(response.body.validationErrors.email).toBe(email_inuse);
  });

  it(`returns errors for both ${username_null} ${email_inuse}`, async () => {
    await User.create({ ...validUser });
    const response = await postUser({
      username: null,
      email: validUser.email,
      password: validUser.password,
    });
    const body = response.body;
    expect(Object.keys(body.validationErrors)).toEqual(["username", "email"]);
  });

  it("creates user in inactive mode", async () => {
    await postUser();
    const users = await User.findAll();
    const savedUser = users[0];
    expect(savedUser.inactive).toBe(true);
  });
});

describe("Internationlization", () => {
  const username_null = "用戶名不能為空";
  const username_size = "必須最少 4 個和最多 32 個字符";
  const email_null = "E-mail不能為空";
  const email_invalid = "E-mail無效";
  const password_null = "密碼不能為空";
  const password_size = "密碼必須至少6個字符";
  const password_patern = "密碼必須至少有 1 個大寫字母、1 個小寫字母和 1 個數字";
  const email_inuse = "E-mail已經使用中";
  const user_create_success = "用戶創建成功";

  it.each`
    field         | value             | expectedMessage
    ${"username"} | ${null}           | ${username_null}
    ${"email"}    | ${null}           | ${email_null}
    ${"password"} | ${null}           | ${password_null}
    ${"username"} | ${"usr"}          | ${username_size}
    ${"username"} | ${"a".repeat(33)} | ${username_size}
    ${"email"}    | ${"abc.com"}      | ${email_invalid}
    ${"email"}    | ${"user.abc.com"} | ${email_invalid}
    ${"email"}    | ${"user@mail"}    | ${email_invalid}
    ${"password"} | ${"pads"}         | ${password_size}
    ${"password"} | ${"alllowercase"} | ${password_patern}
    ${"password"} | ${"ALLUPPERCASE"} | ${password_patern}
    ${"password"} | ${"lowerUPPER"}   | ${password_patern}
    ${"password"} | ${"lower44444"}   | ${password_patern}
    ${"password"} | ${"UPPER44444"}   | ${password_patern}
    ${"password"} | ${"1234567890"}   | ${password_patern}
  `(
    "return $expectedMessage when $field is $value when language is set to hk",
    async ({ field, expectedMessage, value }) => {
      const user = { ...validUser };
      user[field] = value;
      const response = await postUser(user, { language: "hk" });
      const body = response.body;
      expect(body.validationErrors[field]).toBe(expectedMessage);
    }
  );

  it(`returns ${email_inuse} when same email is alreay in use when language is set to hk`, async () => {
    await User.create({ ...validUser });
    const response = await postUser({ ...validUser }, { language: "hk" });
    expect(response.body.validationErrors.email).toBe(email_inuse);
  });

  it(`returns success ${user_create_success} when signup request is valid when language is set to hk`, async () => {
    const response = await postUser({ ...validUser }, { language: "hk" });
    expect(response.body.message).toBe(user_create_success);
  });
});
