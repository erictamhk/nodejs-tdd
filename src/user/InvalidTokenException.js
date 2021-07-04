module.exports = function InvalidTokenException() {
  this.message = "account_activation_failure";
  this.state = 400;
};
