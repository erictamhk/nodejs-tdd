const request = require("supertest");
const app = require("../src/app");
const en = require("../locales/en/translation.json");
const hk = require("../locales/hk/translation.json");

const postPasswordReset = (email = "user1@mail.com", options = {}) => {
  const agent = request(app).post("/api/1.0/password-reset");

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

      expect(response.body.path).toBe("/api/1.0/password-reset");
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
});
