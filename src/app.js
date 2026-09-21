const express = require("express");
const morgan = require("morgan");
const { createDatabase } = require("./database");

async function createApp(
  databaseFile = process.env.DB_FILE || "./data/todos.db",
) {
  const app = express();
  const db = await createDatabase(databaseFile);

  app.use(express.json());
  app.use(morgan("combined"));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "todo-api" });
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
