const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");
const { createApp } = require("../src/app");

let app;
let databasePath;

beforeEach(async () => {
  databasePath = path.join(
    os.tmpdir(),
    `todos-${Date.now()}-${Math.random()}.db`,
  );
  app = await createApp(databasePath);
});

afterEach(() => {
  app.locals.db.close();
  for (const suffix of ["", "-shm", "-wal"]) {
    const file = `${databasePath}${suffix}`;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test("reports a healthy service", async () => {
  const response = await request(app).get("/health");
  expect(response.statusCode).toBe(200);
  expect(response.body.status).toBe("ok");
});

test("exposes Prometheus metrics", async () => {
  const response = await request(app).get("/metrics");
  expect(response.statusCode).toBe(200);
  expect(response.text).toContain("todo_api_http_requests_total");
});

test("supports the complete todo CRUD flow", async () => {
  const created = await request(app)
    .post("/api/todos")
    .send({ title: "Learn Docker" });
  expect(created.statusCode).toBe(201);
  expect(created.body).toMatchObject({
    title: "Learn Docker",
    completed: false,
  });

  const updated = await request(app)
    .put(`/api/todos/${created.body.id}`)
    .send({ completed: true });
  expect(updated.statusCode).toBe(200);
  expect(updated.body.completed).toBe(true);

  const listed = await request(app).get("/api/todos");
  expect(listed.body).toHaveLength(1);

  const removed = await request(app).delete(`/api/todos/${created.body.id}`);
  expect(removed.statusCode).toBe(204);
  expect((await request(app).get("/api/todos")).body).toHaveLength(0);
});

test("rejects an empty title", async () => {
  const response = await request(app).post("/api/todos").send({ title: "   " });
  expect(response.statusCode).toBe(400);
});
