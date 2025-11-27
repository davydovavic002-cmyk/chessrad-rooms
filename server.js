// server.js - Версия с автоматическим матчмейкингом

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const { Chess } = require('chess.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Обслуживание статических файлов из папки 'public'
app.use(express.static(path.join(__dirname, 'public')));

// --- Наша новая система матчмейкинга ---
let waitingPlayer = null; // Здесь будет ждать первый игрок
const rooms = {}; // Хранилище активных игровых комнат

io.on('connection', (socket) => {
    console.log(`[+] Пользователь подключился: ${socket.id}`);

    // --- 1. Игрок нажимает "Найти игру" ---
    socket.on('findGame', () => {
        console.log(`[?] Игрок ${socket.id} ищет игру.`);

        // Если уже есть игрок в ожидании
        if (waitingPlayer) {
            console.log(`[!] Найден оппонент! Игроки: ${waitingPlayer.id} и ${socket.id}`);

            // --- Создаем комнату для них ---
            const roomId = `game-${waitingPlayer.id}-${socket.id}`;
            const whitePlayer = waitingPlayer;
            const blackPlayer = socket;

            // Присоединяем обоих к комнате
            whitePlayer.join(roomId);
            blackPlayer.join(roomId);

            // Создаем запись о комнате
            rooms[roomId] = {
                game: new Chess(),
                players: {
                    [whitePlayer.id]: 'w',
                    [blackPlayer.id]: 'b'
                }
            };

            console.log(`[Комната ${roomId}] Игра создана. Белые: ${whitePlayer.id}, Черные: ${blackPlayer.id}.`);

            // Сбрасываем пул ожидания
            waitingPlayer = null;

            // Отправляем обоим игрокам сигнал о начале игры
            io.to(roomId).emit('gameStart', {
                roomId: roomId,
                fen: rooms[roomId].game.fen(),
                // Мы отправляем каждому его цвет
                // (это можно сделать и на клиенте, но так надежнее)
                yourColor: 'w' // Для белого игрока
            });
            blackPlayer.emit('gameStart', { // Отправляем черному игроку его данные
                roomId: roomId,
                fen: rooms[roomId].game.fen(),
                yourColor: 'b'
            });

        } else {
            // Если в пуле никого нет, этот игрок становится ожидающим
            waitingPlayer = socket;
            console.log(`[i] Игрок ${socket.id} добавлен в пул ожидания.`);
            socket.emit('waitingForOpponent'); // Сообщаем клиенту, что он в очереди
        }
    });

    // --- 2. Обработка хода (остается такой же, как в версии с комнатами) ---
    socket.on('move', (data) => {
        const { roomId, move } = data;
        const room = rooms[roomId];

        if (!room) return;

        // Проверка, чей сейчас ход (очень важная проверка безопасности!)
        const playerColor = room.players[socket.id];
        const game = room.game;

        if (playerColor !== game.turn()) {
            console.log(`[!] Ошибка: Игрок ${socket.id} (${playerColor}) попытался сходить не в свой ход (${game.turn()}).`);
            return; // Игнорируем ход
        }

        const result = game.move(move);

        if (result) {
            console.log(`[Комната ${roomId}] Ход ${move.from}-${move.to}. Новая позиция: ${game.fen()}`);
            io.to(roomId).emit('boardUpdate', game.fen()); // Рассылаем новое состояние всем в комнате

            // Проверка на конец игры
            if (game.isGameOver()) {
                let status = 'Игра окончена';
                if (game.isCheckmate()) status = `Мат! Победили ${game.turn() === 'w' ? 'черные' : 'белые'}.`;
                else if (game.isDraw()) status = 'Ничья.';

                io.to(roomId).emit('gameOver', status);
            }
        }
    });

    // --- 3. Отмена поиска игры ---
    socket.on('cancelFindGame', () => {
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
            console.log(`[i] Игрок ${socket.id} отменил поиск игры.`);
        }
    });

    // --- 4. Обработка отключения ---
    socket.on('disconnect', () => {
        console.log(`[-] Пользователь отключился: ${socket.id}`);

        // Если игрок был в пуле ожидания, просто убираем его
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
            console.log(`[i] Ожидающий игрок ${socket.id} отключился.`);
        }

        // Если игрок был в активной игре
        for (const roomId in rooms) {
            if (rooms[roomId].players[socket.id]) {
                console.log(`[Комната ${roomId}] Игрок ${socket.id} покинул игру.`);
                delete rooms[roomId]; // Удаляем комнату
                // Оповещаем оставшегося игрока
                io.to(roomId).emit('opponentLeft', 'Ваш соперник отключился. Игра окончена.');
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен и слушает на порту ${PORT}`);
});
