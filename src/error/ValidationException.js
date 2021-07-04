module.exports = function ValidationException(errors) {
  this.errors = errors;
  this.state = 400;
};
