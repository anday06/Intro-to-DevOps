require("dotenv").config();
const { createApp } = require("./app");

const port = Number(process.env.PORT) || 3000;

createApp().then((app) => {
  app.listen(port, "0.0.0.0", () => {
    console.log(`Todo API listening on port ${port}`);
  });
});
