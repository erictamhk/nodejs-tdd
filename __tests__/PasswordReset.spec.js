const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const Token = require("../src/auth/Token");
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

const newPassword = "N3w-password";
const vaildToken = "test-token";

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

const putPasswordUpdate = (body = {}, options = {}) => {
  const agent = request(app).put("/api/1.0/user/password");

  if (options.language) {
    agent.set("Accept-Language", options.language);
  }
  return agent.send(body);
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

describe("Password update", () => {
  it("returns 403 when password update request dose not have the valid password reset token", async () => {
    const response = await putPasswordUpdate({ password: "P4ssword", passwordResetToken: "abcd" });
    expect(response.status).toBe(403);
  });

  it.each`
    language | message
    ${"hk"}  | ${hk.unauthroized_password_reset}
    ${"en"}  | ${en.unauthroized_password_reset}
  `(
    "return error body with $message when language is set as $language after trying to update with invalid token",
    async ({ language, message }) => {
      const nowInMillis = new Date().getTime();
      const response = await putPasswordUpdate(
        { password: "P4ssword", passwordResetToken: "abcd" },
        { language: language }
      );

      expect(response.body.path).toBe("/api/1.0/user/password");
      expect(response.body.timestamp).toBeGreaterThan(nowInMillis);
      expect(response.body.message).toBe(message);
    }
  );

  it("returns 403 when password update request with invalid password pattern and the reset token is invalid", async () => {
    const response = await putPasswordUpdate({ password: "not-valid", passwordResetToken: "abcd" });
    expect(response.status).toBe(403);
  });
  it("returns 400 when trying to update invalid password and the reset token is valid", async () => {
    const user = await addUser();
    const vaildToken = "test-token";
    user.passwordResetToken = vaildToken;
    await user.save();
    const response = await putPasswordUpdate({ password: "not-valid", passwordResetToken: vaildToken });
    expect(response.status).toBe(400);
  });

  it.each`
    language | value             | message
    ${"hk"}  | ${null}           | ${hk.password_null}
    ${"hk"}  | ${"pads"}         | ${hk.password_size}
    ${"hk"}  | ${"alllowercase"} | ${hk.password_patern}
    ${"hk"}  | ${"ALLUPPERCASE"} | ${hk.password_patern}
    ${"hk"}  | ${"lowerUPPER"}   | ${hk.password_patern}
    ${"hk"}  | ${"lower44444"}   | ${hk.password_patern}
    ${"hk"}  | ${"UPPER44444"}   | ${hk.password_patern}
    ${"hk"}  | ${"1234567890"}   | ${hk.password_patern}
    ${"en"}  | ${null}           | ${en.password_null}
    ${"en"}  | ${"pads"}         | ${en.password_size}
    ${"en"}  | ${"alllowercase"} | ${en.password_patern}
    ${"en"}  | ${"ALLUPPERCASE"} | ${en.password_patern}
    ${"en"}  | ${"lowerUPPER"}   | ${en.password_patern}
    ${"en"}  | ${"lower44444"}   | ${en.password_patern}
    ${"en"}  | ${"UPPER44444"}   | ${en.password_patern}
    ${"en"}  | ${"1234567890"}   | ${en.password_patern}
  `(
    "return password validation error $message when language is set as $language and the value is $value",
    async ({ language, message, value }) => {
      const user = await addUser();
      const vaildToken = "test-token";
      user.passwordResetToken = vaildToken;
      await user.save();
      const response = await putPasswordUpdate(
        { password: value, passwordResetToken: vaildToken },
        { language: language }
      );
      expect(response.body.validationErrors.password).toBe(message);
    }
  );

  it("returns 200 when valid password is sent with vaild reset token", async () => {
    const user = await addUser();
    const vaildToken = "test-token";
    user.passwordResetToken = vaildToken;
    await user.save();
    const response = await putPasswordUpdate({ password: "N3w-password", passwordResetToken: vaildToken });

    expect(response.status).toBe(200);
  });

  it("update the password in database when the request is valid ", async () => {
    const user = await addUser();
    user.passwordResetToken = vaildToken;
    await user.save();
    await putPasswordUpdate({ password: newPassword, passwordResetToken: vaildToken });

    const userInDB = await User.findOne({ where: { email: activeUser.email } });

    expect(userInDB.password).not.toEqual(user.password);
    const match = await bcrypt.compare(newPassword, userInDB.password);
    expect(match).toBe(true);
  });

  it("clears the reset token in database when the request is valid", async () => {
    const user = await addUser();
    user.passwordResetToken = vaildToken;
    await user.save();
    await putPasswordUpdate({ password: newPassword, passwordResetToken: vaildToken });

    const userInDB = await User.findOne({ where: { email: activeUser.email } });
    expect(userInDB.passwordResetToken).toBeFalsy();
  });

  it("activates and clears activation token in database when the account is inactive after valid password reset", async () => {
    const user = await addUser();
    const activationToken = "activation-token";
    user.passwordResetToken = vaildToken;
    user.activationToken = activationToken;
    user.inactive = true;
    await user.save();
    await putPasswordUpdate({ password: newPassword, passwordResetToken: vaildToken });

    const userInDB = await User.findOne({ where: { email: activeUser.email } });
    expect(userInDB.activationToken).toBeFalsy();
    expect(userInDB.inactive).toBe(false);
  });

  it("clears all tokens of user after valid password reset", async () => {
    const user = await addUser();
    user.passwordResetToken = vaildToken;
    user.inactive = true;
    await user.save();
    await Token.create({
      token: "token-1",
      userId: user.id,
      lastUsedAt: Date.now(),
    });
    await putPasswordUpdate({ password: newPassword, passwordResetToken: vaildToken });

    const tokens = await Token.findAll({ where: { userId: user.id } });
    expect(tokens.length).toBe(0);
  });
});
