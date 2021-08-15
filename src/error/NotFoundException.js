module.exports = function NotFoundException(message) {
  this.state = 404;
  this.message = message;
};
