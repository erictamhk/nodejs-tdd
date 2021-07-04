const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const SMTPServer = require("smtp-server").SMTPServer;

let lastMail, server;
let simulateSmtpFailure = false;

beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true,
    onData(stream, session, callback) {
      let mailBody;
      stream.on("data", (data) => {
        mailBody += data.toString();
      });
      stream.on("end", () => {
        if (simulateSmtpFailure) {
          const err = new Error("Invalid mailbox");
          err.responseCode = 553;
          return callback(err);
        }
        lastMail = mailBody;
        callback();
      });
    },
  });
  await server.listen(8587, "localhost");

  await sequelize.sync();
});

beforeEach(() => {
  simulateSmtpFailure = false;
  return User.destroy({ truncate: true });
});

afterAll(async () => {
  await server.close();
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
    const response = await postUser();
    expect(response.status).toBe(200);
  });

  it("returns success message when signup request is valid", async () => {
    const response = await postUser();
    expect(response.body.message).toBe("User created");
  });

  it("Save the User to database", async () => {
    await postUser();
    const userList = await User.findAll();
    expect(userList.length).toBe(1);
  });

  it("Save the username and email to database", async () => {
    await postUser();
    const userList = await User.findAll();
    const savedUser = userList[0];
    expect(savedUser.username).toBe(validUser.username);
    expect(savedUser.email).toBe(validUser.email);
  });

  it("hashes the pawword in database", async () => {
    await postUser();
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
    const response = await postUser();
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
  it("creates user in inactive mode even the request body contains inactive to false", async () => {
    const newUser = { ...validUser, inactive: false };
    await postUser(newUser);
    const users = await User.findAll();
    const savedUser = users[0];
    expect(savedUser.inactive).toBe(true);
  });
  it("creates an activationToken for user", async () => {
    await postUser();
    const users = await User.findAll();
    const savedUser = users[0];
    expect(savedUser.activationToken).toBeTruthy();
  });
  it("sends an Account activation email with activationToken", async () => {
    await postUser();

    const users = await User.findAll();
    const savedUser = users[0];
    expect(lastMail).toContain(validUser.email);
    expect(lastMail).toContain(savedUser.activationToken);
  });
  it("returns 502 Bad Gateway when sending email fails", async () => {
    simulateSmtpFailure = true;
    const response = await postUser();
    expect(response.status).toBe(502);
  });
  it("returns Email failure message when sending email fails", async () => {
    simulateSmtpFailure = true;
    const response = await postUser();
    expect(response.body.message).toBe("E-mail Failure");
  });
  it("dose not save user to database if activation email fails", async () => {
    simulateSmtpFailure = true;
    await postUser();
    const users = await User.findAll();
    expect(users.length).toBe(0);
  });
  it("returns validation Failure message in error response body when validation fails", async () => {
    const response = await postUser({
      username: null,
      email: validUser.email,
      password: validUser.password,
    });

    expect(response.body.message).toBe("Validation Failure");
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
  const validation_failure = "驗證失敗";

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

  it("returns E-mail傳送失敗 message when sending email fails when language is set to hk", async () => {
    simulateSmtpFailure = true;
    const response = await postUser({ ...validUser }, { language: "hk" });
    expect(response.body.message).toBe("E-mail傳送失敗");
  });
  it(`returns ${validation_failure} message in error response body when validation fails`, async () => {
    const response = await postUser(
      {
        username: null,
        email: validUser.email,
        password: validUser.password,
      },
      { language: "hk" }
    );

    expect(response.body.message).toBe(validation_failure);
  });
});

describe("Account activation", () => {
  it("activates the account when correct token is send", async () => {
    await postUser();
    let users = await User.findAll();
    const token = users[0].activationToken;

    await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();

    users = await User.findAll();
    expect(users[0].inactive).toBe(false);
  });
  it("removes the token from user table after successful activation", async () => {
    await postUser();
    let users = await User.findAll();
    const token = users[0].activationToken;

    await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();

    users = await User.findAll();
    expect(users[0].activationToken).toBeFalsy();
  });
  it("dose not activate the account when token is wrong", async () => {
    await postUser();
    const token = "this-token-dose-not-exist";

    await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();

    const users = await User.findAll();
    expect(users[0].inactive).toBe(true);
  });
  it("returns bad request when token is wrong", async () => {
    await postUser();
    const token = "this-token-dose-not-exist";

    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();

    expect(response.status).toBe(400);
  });

  it.each`
    language | tokenStatus  | message
    ${"hk"}  | ${"wrong"}   | ${"此帳戶已經啟動或Token無效"}
    ${"en"}  | ${"wrong"}   | ${"This account is either active or the token is invalid"}
    ${"hk"}  | ${"correct"} | ${"帳戶已啟動"}
    ${"en"}  | ${"correct"} | ${"Account is activated"}
  `(
    "return $message when $tokenStatus token is sent and leanguage is $language",
    async ({ language, tokenStatus, message }) => {
      await postUser({ ...validUser }, { language });
      let token = "this-token-dose-not-exist";
      if (tokenStatus === "correct") {
        let users = await User.findAll();
        token = users[0].activationToken;
      }

      const response = await request(app)
        .post("/api/1.0/users/token/" + token)
        .set("Accept-Language", language)
        .send();

      expect(response.body.message).toBe(message);
    }
  );
});
describe("Error Model", () => {
  it("returns path, timestamp, message and validationErrors in response when validation failure", async () => {
    const response = await postUser({ ...validUser, username: null });
    const body = response.body;
    expect(Object.keys(body)).toEqual(["path", "timestamp", "message", "validationErrors"]);
  });
  it("returns path, timestamp and message in response when request fails other than validation error", async () => {
    const token = "this-token-dose-not-exist";
    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    const body = response.body;
    expect(Object.keys(body)).toEqual(["path", "timestamp", "message"]);
  });
  it("returns path in error body", async () => {
    const token = "this-token-dose-not-exist";
    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    const body = response.body;
    expect(body.path).toBe("/api/1.0/users/token/" + token);
  });
  it("returns timestamp in milliseconds within 5 seconds value in error body", async () => {
    const nowInMillis = new Date().getTime();
    const fiveSecondsLater = nowInMillis + 5 * 1000;
    const token = "this-token-dose-not-exist";
    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    const body = response.body;
    expect(body.timestamp).toBeGreaterThan(nowInMillis);
    expect(body.timestamp).toBeLessThan(fiveSecondsLater);
  });
});
