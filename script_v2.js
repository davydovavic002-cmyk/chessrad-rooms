// script_v2.js - Новая версия с матчмейкингом

$(document).ready(function() {
    const socket = io();
    let board = null;
    const game = new Chess();

    // --- Элементы интерфейса ---
    const statusEl = $('#status');
    const playerColorEl = $('#player-color');
    const findGameBtn = $('#find-game-btn');
    const cancelFindBtn = $('#cancel-find-btn');

    // --- Переменные состояния игры ---
    let playerColor = null;
    let roomId = null;

    // ===========================================
    // --- Логика обработки ходов ---
    // ===========================================

    function onDragStart(source, piece) {
        // Запретить ходить, если игра не началась или не твой ход
        if (game.isGameOver() || !playerColor || game.turn() !== playerColor) {
            return false;
        }

        // Запретить ходить чужими фигурами
        if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
            (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
            return false;
        }
    }

    function onDrop(source, target) {
        // Попытка сделать ход
        const move = game.move({
            from: source,
            to: target,
            promotion: 'q' // всегда превращаем в ферзя для простоты
        });

        // Если ход некорректный, вернуть фигуру назад
        if (move === null) return 'snapback';

        // Если ход корректный, отправляем его на сервер
        console.log(`Отправляю ход: ${move.san} в комнату ${roomId}`);
        socket.emit('move', { roomId, move });
    }

    // Вызывается после КАЖДОГО хода, чтобы обновить позицию
    function onSnapEnd() {
        board.position(game.fen());
    }

    // ===========================================
    // --- Обработчики событий от сервера ---
    // ===========================================

    // Сервер сообщает, что мы в очереди на поиск игры
    socket.on('waitingForOpponent', () => {
        statusEl.text('Поиск соперника...');
        findGameBtn.hide();
        cancelFindBtn.show();
    });

    // Игра начинается!
    socket.on('gameStart', (data) => {
        roomId = data.roomId;
        playerColor = data.yourColor;

        // Настраиваем доску
        const boardConfig = {
            draggable: true,
            position: data.fen,
            orientation: playerColor === 'w' ? 'white' : 'black',
            onDragStart: onDragStart,
            onDrop: onDrop,
            onSnapEnd: onSnapEnd
        };
        board = Chessboard('board', boardConfig);
        game.load(data.fen);

        // Обновляем интерфейс
        playerColorEl.text(playerColor === 'w' ? 'Белые' : 'Черные');
        statusEl.text('Игра началась! Ваш ход.');
        findGameBtn.hide();
        cancelFindBtn.hide();
        updateStatus();
    });

    // Сервер прислал обновление доски после хода
    socket.on('boardUpdate', (fen) => {
        game.load(fen);
        board.position(fen);
        updateStatus();
    });

    // Соперник отключился
    socket.on('opponentLeft', (message) => {
        statusEl.text(message);
        // Можно добавить кнопку "Найти новую игру"
        findGameBtn.text('Найти новую игру').show();
        playerColor = null; // Сбрасываем состояние, чтобы можно было начать новую игру
        roomId = null;
    });

    // Конец игры (мат, ничья)
    socket.on('gameOver', (message) => {
        statusEl.text(message);
        findGameBtn.text('Найти новую игру').show();
    });

    // ===========================================
    // --- Обработчики кнопок ---
    // ===========================================

    findGameBtn.on('click', () => {
        socket.emit('findGame');
        statusEl.text('Отправка запроса на поиск...');
    });

    cancelFindBtn.on('click', () => {
        socket.emit('cancelFindGame');
        statusEl.text('Поиск отменен. Готовы начать новый?');
        findGameBtn.show();
        cancelFindBtn.hide();
    });

    // --- Вспомогательная функция для обновления статуса ---
    function updateStatus() {
        let statusText = '';
        const moveColor = game.turn() === 'w' ? 'Белых' : 'Черных';

        if (game.isCheckmate()) {
            statusText = `Игра окончена, мат. Победили ${moveColor === 'Белых' ? 'Черные' : 'Белые'}.`;
        } else if (game.isDraw()) {
            statusText = 'Игра окончена, ничья.';
        } else {
            statusText = `Ход ${moveColor}.`;
            if (game.inCheck()) {
                statusText += ' Вам шах!';
            }
        }

        // Не перезаписываем сообщение о конце игры
        if (!game.isGameOver()) {
            statusEl.text(statusText);
        }
    }

    // Инициализация пустой доски при загрузке
    board = Chessboard('board', 'start');
});
