const express = require("express");
const router = express.Router();
const HoaxService = require("./HoaxService");
const { check, validationResult } = require("express-validator");
const pagination = require("../middleware/pagination");
const AuthenticationException = require("../auth/AuthenticationException");
const ValidationException = require("../error/ValidationException");
const ForbiddenException = require("../error/ForbiddenException");

router.post(
  "/api/1.0/hoaxes",
  check("content").isLength({ min: 10, max: 5000 }).withMessage("hoax_content_size"),
  async (req, res, next) => {
    const authenticatedUser = req.authenticatedUser;
    // eslint-disable-next-line eqeqeq
    if (!authenticatedUser) {
      return next(new AuthenticationException("unauthroized_hoax_submit"));
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }
    await HoaxService.save(req.body, authenticatedUser);
    return res.send({ message: req.t("hoax_submit_success") });
  }
);

router.get(["/api/1.0/hoaxes", "/api/1.0/users/:userId/hoaxes"], pagination, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { size, page } = req.pagination;
    const hoaxes = await HoaxService.getHoaxes(page, size, userId);
    res.send(hoaxes);
  } catch (err) {
    next(err);
  }
});

router.delete("/api/1.0/hoaxes/:hoaxId", async (req, res, next) => {
  const authenticatedUser = req.authenticatedUser;
  if (!authenticatedUser) {
    return next(new ForbiddenException("unauthroized_hoax_delete"));
  }
  const hoaxId = req.params.hoaxId;

  try {
    await HoaxService.deleteHoax(hoaxId, authenticatedUser.id);
  } catch (err) {
    return next(err);
  }

  return res.send();
});

module.exports = router;
