module.exports = function ForbiddenException(message) {
  this.state = 403;
  this.message = message || "inactive_authentication_failure";
};
