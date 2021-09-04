module.exports = function AuthenticationException(message) {
  this.state = 401;
  this.message = message || "authentication_failure";
};
