const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const SMTPServer = require("smtp-server").SMTPServer;
const en = require("../locales/en/translation.json");
const hk = require("../locales/hk/translation.json");
const config = require("config");

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
  await server.listen(config.mail.port, "localhost");

  if (process.env.NODE_ENV === "test") {
    await sequelize.sync();
  }
  jest.setTimeout(20000);
});

beforeEach(async () => {
  simulateSmtpFailure = false;
  return User.destroy({ truncate: { cascade: true } });
});

afterAll(async () => {
  await server.close();
  jest.setTimeout(5000);
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
    expect(response.body.message).toBe(en.user_create_success);
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

  it.each`
    field         | value             | expectedMessage
    ${"username"} | ${null}           | ${en.username_null}
    ${"email"}    | ${null}           | ${en.email_null}
    ${"password"} | ${null}           | ${en.password_null}
    ${"username"} | ${"usr"}          | ${en.username_size}
    ${"username"} | ${"a".repeat(33)} | ${en.username_size}
    ${"email"}    | ${"abc.com"}      | ${en.email_invalid}
    ${"email"}    | ${"user.abc.com"} | ${en.email_invalid}
    ${"email"}    | ${"user@mail"}    | ${en.email_invalid}
    ${"password"} | ${"pads"}         | ${en.password_size}
    ${"password"} | ${"alllowercase"} | ${en.password_patern}
    ${"password"} | ${"ALLUPPERCASE"} | ${en.password_patern}
    ${"password"} | ${"lowerUPPER"}   | ${en.password_patern}
    ${"password"} | ${"lower44444"}   | ${en.password_patern}
    ${"password"} | ${"UPPER44444"}   | ${en.password_patern}
    ${"password"} | ${"1234567890"}   | ${en.password_patern}
  `("return $expectedMessage when $field is $value", async ({ field, expectedMessage, value }) => {
    const user = { ...validUser };
    user[field] = value;
    const response = await postUser(user);
    const body = response.body;
    expect(body.validationErrors[field]).toBe(expectedMessage);
  });

  it(`returns ${en.email_inuse} when same email is alreay in use`, async () => {
    await User.create({ ...validUser });
    const response = await postUser();
    expect(response.body.validationErrors.email).toBe(en.email_inuse);
  });

  it(`returns errors for both ${en.username_null} ${en.email_inuse}`, async () => {
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
  it(`returns ${en.email_failure} message when sending email fails`, async () => {
    simulateSmtpFailure = true;
    const response = await postUser();
    expect(response.body.message).toBe(en.email_failure);
  });
  it("dose not save user to database if activation email fails", async () => {
    simulateSmtpFailure = true;
    await postUser();
    const users = await User.findAll();
    expect(users.length).toBe(0);
  });
  it(`returns ${en.validation_failure} message in error response body when validation fails`, async () => {
    const response = await postUser({
      username: null,
      email: validUser.email,
      password: validUser.password,
    });

    expect(response.body.message).toBe(en.validation_failure);
  });
});

describe("Internationlization", () => {
  it.each`
    field         | value             | expectedMessage
    ${"username"} | ${null}           | ${hk.username_null}
    ${"email"}    | ${null}           | ${hk.email_null}
    ${"password"} | ${null}           | ${hk.password_null}
    ${"username"} | ${"usr"}          | ${hk.username_size}
    ${"username"} | ${"a".repeat(33)} | ${hk.username_size}
    ${"email"}    | ${"abc.com"}      | ${hk.email_invalid}
    ${"email"}    | ${"user.abc.com"} | ${hk.email_invalid}
    ${"email"}    | ${"user@mail"}    | ${hk.email_invalid}
    ${"password"} | ${"pads"}         | ${hk.password_size}
    ${"password"} | ${"alllowercase"} | ${hk.password_patern}
    ${"password"} | ${"ALLUPPERCASE"} | ${hk.password_patern}
    ${"password"} | ${"lowerUPPER"}   | ${hk.password_patern}
    ${"password"} | ${"lower44444"}   | ${hk.password_patern}
    ${"password"} | ${"UPPER44444"}   | ${hk.password_patern}
    ${"password"} | ${"1234567890"}   | ${hk.password_patern}
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

  it(`returns ${hk.email_inuse} when same email is alreay in use when language is set to hk`, async () => {
    await User.create({ ...validUser });
    const response = await postUser({ ...validUser }, { language: "hk" });
    expect(response.body.validationErrors.email).toBe(hk.email_inuse);
  });

  it(`returns success ${hk.user_create_success} when signup request is valid when language is set to hk`, async () => {
    const response = await postUser({ ...validUser }, { language: "hk" });
    expect(response.body.message).toBe(hk.user_create_success);
  });

  it(`returns ${hk.email_failure} message when sending email fails when language is set to hk`, async () => {
    simulateSmtpFailure = true;
    const response = await postUser({ ...validUser }, { language: "hk" });
    expect(response.body.message).toBe(hk.email_failure);
  });
  it(`returns ${hk.validation_failure} message in error response body when validation fails`, async () => {
    const response = await postUser(
      {
        username: null,
        email: validUser.email,
        password: validUser.password,
      },
      { language: "hk" }
    );

    expect(response.body.message).toBe(hk.validation_failure);
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
    ${"hk"}  | ${"wrong"}   | ${hk.account_activation_failure}
    ${"en"}  | ${"wrong"}   | ${en.account_activation_failure}
    ${"hk"}  | ${"correct"} | ${hk.account_activation_success}
    ${"en"}  | ${"correct"} | ${en.account_activation_success}
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
