const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const bcrypt = require("bcrypt");
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

  await sequelize.sync();
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

const postPasswordReset = (email = "user1@mail.com", options = {}) => {
  const agent = request(app).post("/api/1.0/user/password");

  if (options.language) {
    agent.set("Accept-Language", options.language);
  }
  return agent.send({ email: email });
};

describe("Password Reset Request", () => {
  it("returns 404 when a password reset request is sent for unknow email", async () => {
    const response = await postPasswordReset();
    expect(response.status).toBe(404);
  });

  it.each`
    language | message
    ${"hk"}  | ${hk.email_not_inuse}
    ${"en"}  | ${en.email_not_inuse}
  `(
    "return error body with $message for unknow email for password reset request when language is $language",
    async ({ language, message }) => {
      const nowInMillis = new Date().getTime();
      const response = await postPasswordReset("user1@mail.com", { language: language });

      expect(response.body.path).toBe("/api/1.0/user/password");
      expect(response.body.timestamp).toBeGreaterThan(nowInMillis);
      expect(response.body.message).toBe(message);
    }
  );

  it.each`
    language | message
    ${"hk"}  | ${hk.email_invalid}
    ${"en"}  | ${en.email_invalid}
  `(
    "return 400 with validation error response having $message when request dose not have valid email and language is $language",
    async ({ language, message }) => {
      const response = await postPasswordReset(null, { language: language });

      expect(response.body.validationErrors.email).toBe(message);
      expect(response.status).toBe(400);
    }
  );

  it("returns 200 ok when a password reset request is sent for know e-mail", async () => {
    const user = await addUser();
    const response = await postPasswordReset(user.email);
    expect(response.status).toBe(200);
  });

  it.each`
    language | message
    ${"hk"}  | ${hk.password_reset_request_success}
    ${"en"}  | ${en.password_reset_request_success}
  `(
    "return success response body with $message for know email for password reset request when language is set as $language",
    async ({ language, message }) => {
      const user = await addUser();
      const response = await postPasswordReset(user.email, { language: language });

      expect(response.body.message).toBe(message);
    }
  );

  it("creates passwordResetToken when a password reset request is sent for known e-mail", async () => {
    const user = await addUser();
    await postPasswordReset(user.email);
    const userInDB = await User.findOne({ where: { email: user.email } });
    expect(userInDB.passwordResetToken).toBeTruthy();
  });

  it("sends a password reset email with passwordResetToken", async () => {
    const user = await addUser();
    await postPasswordReset(user.email);
    const userInDB = await User.findOne({ where: { email: user.email } });
    const passwordResetToken = userInDB.passwordResetToken;

    expect(lastMail).toContain(user.email);
    expect(lastMail).toContain(passwordResetToken);
  });

  it("returns 502 Bad Gateway when sending email fails", async () => {
    simulateSmtpFailure = true;
    const user = await addUser();
    const response = await postPasswordReset(user.email);
    expect(response.status).toBe(502);
  });

  it.each`
    language | message
    ${"hk"}  | ${hk.email_failure}
    ${"en"}  | ${en.email_failure}
  `("return $message when language is set as $language after e-mail is failure", async ({ language, message }) => {
    simulateSmtpFailure = true;
    const user = await addUser();
    const response = await postPasswordReset(user.email, { language: language });
    expect(response.body.message).toBe(message);
  });
});
