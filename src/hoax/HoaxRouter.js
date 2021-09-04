const express = require("express");
const router = express.Router();
const AuthenticationException = require("../auth/AuthenticationException");
const HoaxService = require("./HoaxService");

router.post("/api/1.0/hoaxes", async (req, res, next) => {
  const authenticatedUser = req.authenticatedUser;
  // eslint-disable-next-line eqeqeq
  if (!authenticatedUser) {
    return next(new AuthenticationException("unauthroized_hoax_submit"));
  }
  await HoaxService.save(req.body);
  return res.send({ message: req.t("hoax_submit_success") });
});

module.exports = router;
