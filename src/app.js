const express = require("express");
const morgan = require("morgan");
const promClient = require("prom-client");
const { createDatabase } = require("./database");

const metricsRegistry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: metricsRegistry });
const requestCounter = new promClient.Counter({
  name: "todo_api_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [metricsRegistry],
});
const requestDuration = new promClient.Histogram({
  name: "todo_api_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route"],
  registers: [metricsRegistry],
});

async function createApp(
  databaseFile = process.env.DB_FILE || "./data/todos.db",
) {
  const app = express();
  const db = await createDatabase(databaseFile);

  app.use(express.json());
  app.use(morgan("combined"));
  app.use((request, response, next) => {
    const start = process.hrtime.bigint();
    response.on("finish", () => {
      const route = request.route?.path || request.path;
      requestCounter.inc({
        method: request.method,
        route,
        status_code: response.statusCode,
      });
      requestDuration.observe(
        { method: request.method, route },
        Number(process.hrtime.bigint() - start) / 1e9,
      );
    });
    next();
  });

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "todo-api" });
  });

  app.get("/metrics", async (_request, response) => {
    response.set("Content-Type", metricsRegistry.contentType);
    response.end(await metricsRegistry.metrics());
  });

  app.get("/api/todos", (_request, response) => {
    const todos = db.prepare("SELECT * FROM todos ORDER BY id DESC").all();
    response.json(todos.map(formatTodo));
  });

  app.get("/api/todos/:id", (request, response) => {
    const todo = db
      .prepare("SELECT * FROM todos WHERE id = ?")
      .get(request.params.id);
    if (!todo) return response.status(404).json({ error: "Todo not found" });
    return response.json(formatTodo(todo));
  });

  app.post("/api/todos", (request, response) => {
    const title =
      typeof request.body.title === "string" ? request.body.title.trim() : "";
    if (!title)
      return response.status(400).json({ error: "Title is required" });

    const result = db
      .prepare("INSERT INTO todos (title) VALUES (?)")
      .run(title);
    const todo = db
      .prepare("SELECT * FROM todos WHERE id = ?")
      .get(result.lastInsertRowid);
    return response.status(201).json(formatTodo(todo));
  });

  app.put("/api/todos/:id", (request, response) => {
    const currentTodo = db
      .prepare("SELECT * FROM todos WHERE id = ?")
      .get(request.params.id);
    if (!currentTodo)
      return response.status(404).json({ error: "Todo not found" });

    const title =
      request.body.title === undefined
        ? currentTodo.title
        : typeof request.body.title === "string"
          ? request.body.title.trim()
          : "";
    const completed =
      request.body.completed === undefined
        ? currentTodo.completed
        : request.body.completed;

    if (!title || typeof completed !== "boolean") {
      return response.status(400).json({
        error: "Title must be non-empty and completed must be boolean",
      });
    }

    db.prepare(
      "UPDATE todos SET title = ?, completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(title, completed ? 1 : 0, request.params.id);
    const todo = db
      .prepare("SELECT * FROM todos WHERE id = ?")
      .get(request.params.id);
    return response.json(formatTodo(todo));
  });

  app.delete("/api/todos/:id", (request, response) => {
    const result = db
      .prepare("DELETE FROM todos WHERE id = ?")
      .run(request.params.id);
    if (result.changes === 0)
      return response.status(404).json({ error: "Todo not found" });
    return response.status(204).send();
  });

  app.use((_request, response) =>
    response.status(404).json({ error: "Route not found" }),
  );
  app.locals.db = db;
  return app;
}

function formatTodo(todo) {
  return { ...todo, completed: Boolean(todo.completed) };
}

module.exports = { createApp };
