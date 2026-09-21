const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const server = new WebSocket.Server({
    port: PORT
});

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

    console.log("Oyuncu bağlandı.");

    send(socket, {
        type: "connected",
        message: "Zombie City sunucusuna bağlandın."
    });

    socket.on("message", raw => {
        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        /* =========================
           ODA OLUŞTUR
        ========================= */
        if (data.type === "createRoom") {
            if (socket.room) return;

            const code = makeRoomCode();

            rooms.set(code, {
                players: [socket]
            });

            socket.room = code;
            socket.playerId = 1;

            send(socket, {
                type: "roomCreated",
                code: code,
                playerId: 1,
                players: 1
            });

            console.log("Oda kuruldu:", code);
            return;
        }

        /* =========================
           ODAYA KATIL
        ========================= */
        if (data.type === "joinRoom") {
            const code = String(data.code || "");
            const room = rooms.get(code);

            if (!room) {
                send(socket, {
                    type: "error",
                    message: "Oda bulunamadı."
                });
                return;
            }

            if (room.players.length >= 2) {
                send(socket, {
                    type: "error",
                    message: "ODA DOLU (2/2)"
                });
                return;
            }

            room.players.push(socket);

            socket.room = code;
            socket.playerId = 2;

            send(socket, {
                type: "joinedRoom",
                code: code,
                playerId: 2,
                players: 2
            });

            broadcast(room, {
                type: "playerJoined",
                playerId: 2,
                players: 2
            });

            console.log("Oyuncu odaya katıldı:", code);
            return;
        }

        /* =========================
           OYUNCU DURUMU
        ========================= */
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
                shooting: !!data.shooting
            }, socket);

            return;
        }

        /* =========================
           ATEŞ
        ========================= */
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

        /* =========================
           HASAR
        ========================= */
        if (data.type === "damage") {
            if (!socket.room) return;
            const room = rooms.get(socket.room);
            if (!room) return;

            broadcast(room, {
                type: "playerDamage",
                playerId: socket.playerId,
                damage: Number(data.damage) || 0
            }, socket);

            return;
        }

        /* =========================
           ZOMBİ SENKRONİZASYONU
        ========================= */
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

        /* =========================
           SOHBET (CHAT)
        ========================= */
        if (data.type === "chat") {
            if (!socket.room) return;
            const room = rooms.get(socket.room);
            if (!room) return;

            broadcast(room, {
                type: "chatMessage",
                playerId: socket.playerId,
                message: String(data.message || "").substring(0, 80)
            });

            return;
        }
    });

    /* =========================
       BAĞLANTI KOPTU
    ========================= */
    socket.on("close", () => {
        const code = socket.room;
        if (!code) return;

        const room = rooms.get(code);
        if (!room) return;

        room.players = room.players.filter(player => player !== socket);

        broadcast(room, {
            type: "playerLeft",
            playerId: socket.playerId,
            players: room.players.length
        });

        console.log("Oyuncu ayrıldı:", code);

        if (room.players.length === 0) {
            rooms.delete(code);
            console.log("Oda silindi:", code);
        }
    });
});

/* =========================
   SUNUCU BAŞLADI
========================= */
server.on("listening", () => {
    console.log("Zombie City multiplayer server başladı.");
    console.log("Port: " + PORT);
});

/* =========================
   HATA
========================= */
server.on("error", error => {
    console.error("Sunucu hatası:", error.message);
});
          
