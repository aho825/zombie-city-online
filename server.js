const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });
const rooms = new Map();

function send(socket, data) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

function makeRoomCode() {
    let code;
    do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms.has(code));
    return code;
}

function broadcast(room, data, except = null) {
    room.players.forEach(player => {
        if (player !== except) {
            send(player, data);
        }
    });
}

server.on("connection", socket => {
    socket.room = null;
    socket.playerId = null;
    socket.isReady = false;

    send(socket, { type: "connected", message: "Zombie City sunucusuna bağlandın." });

    socket.on("message", raw => {
        let data;
        try { data = JSON.parse(raw.toString()); } catch { return; }

        if (data.type === "createRoom") {
            if (socket.room) return;
            const code = makeRoomCode();
            rooms.set(code, { players: [socket] });
            socket.room = code;
            socket.playerId = 1;
            socket.isReady = false;
            send(socket, { type: "roomCreated", code, playerId: 1, players: 1 });
            return;
        }

        if (data.type === "joinRoom") {
            const code = String(data.code || "");
            const room = rooms.get(code);
            if (!room) {
                send(socket, { type: "error", message: "Oda bulunamadı." });
                return;
            }
            if (room.players.length >= 2) {
                send(socket, { type: "error", message: "Oda dolu!" });
                return;
            }

            room.players.push(socket);
            socket.room = code;
            socket.playerId = 2;
            socket.isReady = false;

            send(socket, { type: "joinedRoom", code, playerId: 2, players: 2 });
            broadcast(room, { type: "playerJoined", playerId: 2, players: 2 });
            return;
        }

        if (data.type === "state") {
            if (!socket.room) return;
            const room = rooms.get(socket.room);
            if (!room) return;

            broadcast(room, {
                type: "remoteState",
                playerId: socket.playerId,
                x: Number(data.x) || 0,
                y: Number(data.y) || 0,
                angle: Number(data.angle) || 0,
                hp: Number(data.hp) !== undefined ? Number(data.hp) : 100,
                isDowned: !!data.isDowned
            }, socket);
            return;
        }

        if (data.type === "shoot") {
            if (!socket.room) return;
            const room = rooms.get(socket.room);
            if (!room) return;

            broadcast(room, {
                type: "remoteShoot",
                playerId: socket.playerId,
                x: Number(data.x) || 0,
                y: Number(data.y) || 0,
                angle: Number(data.angle) || 0
            }, socket);
            return;
        }

        if (data.type === "zombieSync") {
            if (!socket.room) return;
            const room = rooms.get(socket.room);
            if (!room) return;

            broadcast(room, {
                type: "zombieSync",
                zombies: data.zombies || []
            }, socket);
            return;
        }

        if (data.type === "reviveNotify") {
            if (!socket.room) return;
            const room = rooms.get(socket.room);
            if (!room) return;

            broadcast(room, {
                type: "revivePlayer",
                targetId: data.targetId
            });
            return;
        }

        /* HAZIR BUTONU BİLDİRİMİ */
        if (data.type === "playerReady") {
            if (!socket.room) return;
            const room = rooms.get(socket.room);
            if (!room) return;

            socket.isReady = true;

            const readyCount = room.players.filter(p => p.isReady).length;

            room.players.forEach(p => {
                send(p, {
                    type: "readyStatusUpdate",
                    readyCount: readyCount,
                    totalPlayers: room.players.length
                });
            });

            if (room.players.length >= 2 && readyCount >= 2) {
                room.players.forEach(p => p.isReady = false);
                room.players.forEach(p => {
                    send(p, { type: "startRestartCountdown" });
                });
            }
            return;
        }
    });

    socket.on("close", () => {
        const code = socket.room;
        if (!code) return;
        const room = rooms.get(code);
        if (!room) return;

        room.players = room.players.filter(p => p !== socket);
        broadcast(room, { type: "playerLeft", playerId: socket.playerId });
        if (room.players.length === 0) rooms.delete(code);
    });
});

server.on("listening", () => console.log("Sunucu başladı. Port: " + PORT));
                
