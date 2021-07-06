const express = require("express");
const UserService = require("./UserService");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const ValidationException = require("../error/ValidationException");

router.post(
  "/api/1.0/users",
  check("username")
    .notEmpty()
    .withMessage("username_null")
    .bail()
    .isLength({ min: 4, max: 32 })
    .withMessage("username_size"),
  check("email")
    .notEmpty()
    .withMessage("email_null")
    .bail()
    .isEmail()
    .withMessage("email_invalid")
    .bail()
    .custom(async (email) => {
      const user = await UserService.findByEmail(email);
      if (user) {
        throw new Error("email_inuse");
      }
    }),
  check("password")
    .notEmpty()
    .withMessage("password_null")
    .bail()
    .isLength({ min: 6 })
    .withMessage("password_size")
    .bail()
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).*$/)
    .withMessage("password_patern"),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }
    try {
      await UserService.save(req.body);
      return res.send({ message: req.t("user_create_success") });
    } catch (err) {
      next(err);
    }
  }
);

router.post("/api/1.0/users/token/:token", async (req, res, next) => {
  const token = req.params.token;
  try {
    await UserService.activate(token);
    res.send({ message: req.t("account_activation_success") });
  } catch (err) {
    next(err);
  }
});

router.get("/api/1.0/users", async (req, res) => {
  const users = await UserService.getUsers();
  res.send(users);
});

module.exports = router;
