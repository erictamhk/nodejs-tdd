const express = require("express");
const router = express.Router();
const UserService = require("./UserService");
const { check, validationResult } = require("express-validator");
const ValidationException = require("../error/ValidationException");
const ForbiddenException = require("../error/ForbiddenException");
const pagination = require("../middleware/pagination");
const bcrypt = require("bcrypt");

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

router.get("/api/1.0/users", pagination, async (req, res) => {
  const { size, page } = req.pagination;
  const users = await UserService.getUsers(page, size);
  res.send(users);
});

router.get("/api/1.0/users/:id", async (req, res, next) => {
  try {
    const user = await UserService.getUser(req.params.id);
    res.send(user);
  } catch (err) {
    next(err);
  }
});

router.put("/api/1.0/users/:id", async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (authorization) {
    const encoded = authorization.substring(6);
    const decoded = Buffer.from(encoded, "base64").toString("ascii");
    const [email, password] = decoded.split(":");
    const user = await UserService.findByEmail(email);
    if (!user) {
      return next(new ForbiddenException("unauthroized_user_update"));
    }
    // eslint-disable-next-line eqeqeq
    if (user.id != req.params.id) {
      return next(new ForbiddenException("unauthroized_user_update"));
    }
    if (user.inactive) {
      return next(new ForbiddenException("unauthroized_user_update"));
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return next(new ForbiddenException("unauthroized_user_update"));
    }
    await UserService.updateUser(req.params.id, req.body);
    return res.send();
  }
  return next(new ForbiddenException("unauthroized_user_update"));
});

module.exports = router;
