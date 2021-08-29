module.exports = {
  database: {
    database: "hoaxify",
    username: "my-db-user",
    password: "db-p4ss",
    dialect: "sqlite",
    storage: "./database.sqlite",
    logging: false,
  },
  mail: {
    host: "smtp.ethereal.email",
    port: 587,
    auth: {
      user: "colin49@ethereal.email",
      pass: "Wtr9XSDUZHtjtq2bV3",
    },
  },
  uploadDir: "upload-dev",
  profileDir: "profile",
};
