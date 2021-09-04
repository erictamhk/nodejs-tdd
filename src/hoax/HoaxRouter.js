const express = require("express");
const router = express.Router();
const AuthenticationException = require("../auth/AuthenticationException");

router.post("/api/1.0/hoaxes", async (req, res, next) => {
  const authenticatedUser = req.authenticatedUser;
  // eslint-disable-next-line eqeqeq
  if (!authenticatedUser) {
    return next(new AuthenticationException("unauthroized_hoax_submit"));
  }
  return res.send();
});

module.exports = router;
