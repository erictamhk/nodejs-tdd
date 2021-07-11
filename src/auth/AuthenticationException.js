module.exports = function AuthenticationException() {
  this.state = 401;
  this.message = "authentication_failure";
};
