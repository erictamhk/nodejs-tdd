const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");

beforeAll(async () => {
  await sequelize.sync();
});

beforeEach(() => {
  return User.destroy({ truncate: true });
});

const getUsers = () => {
  return request(app).get("/api/1.0/users");
};

const addUser = async (activeUserCount = 0, inactiveUserCount = 0) => {
  for (let i = 0; i < activeUserCount + inactiveUserCount; i++) {
    await User.create({
      username: `user${i + 1}`,
      email: `user${i + 1}@mail.com`,
      inactive: i >= activeUserCount,
    });
  }
};

describe("Listing users", () => {
  it("returns 200 ok when there are no user in database", async () => {
    const response = await getUsers();
    expect(response.status).toBe(200);
  });
  it("returns page object as response body", async () => {
    const response = await getUsers();
    expect(response.body).toEqual({
      content: [],
      page: 0,
      size: 10,
      totalPages: 0,
    });
  });
  it("returns 10 users in page content when there are 11 users in database", async () => {
    await addUser(11);
    const response = await getUsers();
    expect(response.body.content.length).toBe(10);
  });
  it("returns 6 users in page content when there are active 6 users and 5 inactive users in database", async () => {
    await addUser(6, 5);
    const response = await getUsers();
    expect(response.body.content.length).toBe(6);
  });
  it("returns only id, username and email in content array for each user", async () => {
    await addUser(11);
    const response = await getUsers();
    const user = response.body.content[0];
    expect(Object.keys(user)).toEqual(["id", "username", "email"]);
  });
  it("returns 2 as totalPages when there are 15 active and 7 inactive users", async () => {
    await addUser(15, 7);
    const response = await getUsers();
    expect(response.body.totalPages).toBe(2);
  });
});