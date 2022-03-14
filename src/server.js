import http from "http";
import { Server } from "socket.io";
import { instrument } from "@socket.io/admin-ui";
import express from "express";
import livereload from "livereload";
import connectLivereload from "connect-livereload";

const liveReloadServer = livereload.createServer({
  exts: ["pug", "js", "scss"],
});
liveReloadServer.server.once("connection", () => {
  setTimeout(() => {
    liveReloadServer.refresh("/");
  }, 100);
});

const app = express();
app.use(connectLivereload());

app.set("view engine", "pug");
app.set("views", __dirname + "/views");
app.use("/public", express.static(__dirname + "/public"));
app.get("/", (req, res) => res.render("home"));
app.get("/*", (req, res) => res.redirect("/"));

const httpServer = http.createServer(app);
const wsServer = new Server(httpServer, {
  cors: {
    origin: ["https://admin.socket.io"],
    credentials: true,
  },
});
instrument(wsServer, {
  auth: false,
});

function publicRooms() {
  const {
    sockets: {
      adapter: { sids, rooms },
    },
  } = wsServer;
  const publicRooms = [];
  rooms.forEach((_, key) => {
    if (sids.get(key) === undefined) {
      publicRooms.push(key);
    }
  });
  return publicRooms;
}

function countUserInRoom(roomName) {
  return wsServer.sockets.adapter.rooms.get(roomName)?.size;
}

wsServer.on("connection", (socket) => {
  socket["partnerNickname"] = "Anonymous";
  socket["nickname"] = "Anonymous";
  wsServer.sockets.emit("update_rooms", publicRooms());
  socket.on("join_room", (nickname, roomName) => {
    socket.nickname = nickname;
    socket.join(roomName);
    socket.to(roomName).emit("set_header", nickname);
    socket.to(roomName).emit("start_chat", nickname);
    socket.to(roomName).emit("send_offer");
    wsServer.sockets.emit("update_rooms", publicRooms());
  });
  socket.on("header", (nickname, partnerNickname, roomName) => {
    socket.partnerNickname = partnerNickname;
    socket.to(roomName).emit("header", nickname);
  });
  socket.on("partner_nickname", (partnerNickname) => {
    socket.partnerNickname = partnerNickname;
  });
  socket.on("join_chat", (nickname, roomName) => {
    socket.to(roomName).emit("join_chat", nickname);
  });
  socket.on("offer", (offer, roomName) => {
    socket.to(roomName).emit("offer", offer);
  });
  socket.on("answer", (answer, roomName) => {
    socket.to(roomName).emit("answer", answer);
  });
  socket.on("ice", (ice, roomName) => {
    socket.to(roomName).emit("ice", ice);
  });
  socket.on("disconnecting", () => {
    socket.rooms.forEach((room) => {
      socket.to(room).emit("leave_chat", socket.nickname);
      socket.to(room).emit("leave_call");
    });
  });
  socket.on("disconnect", () => {
    wsServer.sockets.emit("update_rooms", publicRooms());
  });
});

const PORT = 4000;
function handelListen() {
  console.log(`Listening on http://localhost:${PORT}`);
}
httpServer.listen(PORT, handelListen);
