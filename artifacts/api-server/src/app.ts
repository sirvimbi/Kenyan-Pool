import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { Server } from "socket.io";
import { setupMatchmaking } from "./game/Matchmaker";

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

setupMatchmaking(io);

export default httpServer;
