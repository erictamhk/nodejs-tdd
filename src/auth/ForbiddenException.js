module.exports = function ForbiddenException() {
  this.state = 403;
  this.message = "inactive_authentication_failure";
};
