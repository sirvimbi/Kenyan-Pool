import { Server, Socket } from "socket.io";
import { GameRoom } from "./GameRoom";

const waitingQueues = new Map<number, { socketId: string; name: string; uid: string }[]>();
const activeGames = new Map<string, GameRoom>();

export function setupMatchmaking(io: Server) {
  io.on("connection", (socket: Socket) => {
    socket.on("matchmaking:join", ({ stake, name, uid }) => {
      if (!stake || !uid) return;

      // Check if there is an active game for this stake that has room for spectators/late joiners
      let existingGameId: string | null = null;
      activeGames.forEach((game, id) => {
        if (game.stake === stake && game.players.length < 5 && game.phase !== 'roundEnd') {
          existingGameId = id;
        }
      });

      if (existingGameId) {
        // Option to join existing game as a spectator or late joiner
        socket.emit("matchmaking:available_game", { roomId: existingGameId });
      }

      let queue = waitingQueues.get(stake) || [];
      if (queue.find(p => p.uid === uid)) return;

      queue.push({ socketId: socket.id, name, uid });
      waitingQueues.set(stake, queue);

      if (queue.length >= 2) {
        const roomId = `room_${stake}_${Date.now()}`;
        const game = new GameRoom(roomId, 'pvp', stake);

        const playersToJoin = queue.splice(0, 5);
        waitingQueues.set(stake, queue);

        playersToJoin.forEach((p, i) => {
          game.addPlayer({ id: i, name: p.name, socketId: p.socketId, isAI: false });
          const playerSocket = io.sockets.sockets.get(p.socketId);
          if (playerSocket) playerSocket.join(roomId);
        });

        game.initGame();
        activeGames.set(roomId, game);
        io.to(roomId).emit("game:started", { roomId, state: game.getHUDState() });
      }
    });

    socket.on("game:join_existing", ({ roomId, name, uid }) => {
      const game = activeGames.get(roomId);
      if (game && game.players.length < 5) {
        const nextId = game.players.length;
        game.addPlayer({ id: nextId, name, socketId: socket.id, isAI: false });
        socket.join(roomId);
        socket.emit("game:started", { roomId, state: game.getHUDState() });
        // Notify others
        io.to(roomId).emit("game:player_joined", { player: game.players[nextId] });
      }
    });

    socket.on("ai:join", ({ stake, name, uid }) => {
      const roomId = `ai_${uid}_${Date.now()}`;
      const game = new GameRoom(roomId, 'ai', stake);
      game.addPlayer({ id: 0, name: name, socketId: socket.id, isAI: false });
      game.addPlayer({ id: 1, name: "Bot", socketId: "ai", isAI: true });

      game.initGame();
      activeGames.set(roomId, game);
      socket.join(roomId);
      socket.emit("game:started", { roomId, state: game.getHUDState() });
    });

    socket.on("game:move", ({ roomId, aimAngle, power, spin }) => {
      const game = activeGames.get(roomId);
      if (game) {
        game.handleShot(socket.id, aimAngle, power, spin);
        io.to(roomId).emit("game:state_update", {
          state: game.getHUDState(),
          balls: game.balls
        });
      }
    });

    socket.on("disconnect", () => {
      waitingQueues.forEach((queue, stake) => {
        waitingQueues.set(stake, queue.filter(p => p.socketId !== socket.id));
      });
    });
  });

  setInterval(() => {
    activeGames.forEach((game, roomId) => {
      if (game.phase === 'aiming') {
        game.updateTimer();
        io.to(roomId).emit("game:timer", { timeLeft: Math.ceil(game.timeLeft), currentPlayerIndex: game.currentPlayerIndex });
      }
    });
  }, 1000);
}
