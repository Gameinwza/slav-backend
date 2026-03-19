const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const socketHandler = require("./socket/handlers");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

socketHandler(io);

server.listen(3001, () => {
  console.log("Server running");
});