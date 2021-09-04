module.exports = function FileSizeException() {
  this.message = "attachment_size_limit";
  this.state = 400;
};
