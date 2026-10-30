const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const QUESTION_MS = 15_000;
const REVEAL_MS = 5_000;
const rooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true }));

const questions = [
  { category: 'Food', text: 'Which Yogyakarta specialty is made from young jackfruit slowly cooked in coconut milk?', options: ['Rawon', 'Gudeg', 'Coto Makassar', 'Pempek'], answer: 1, note: 'Gudeg is one of Yogyakarta’s best-known dishes, traditionally served with rice and savory sides.' },
  { category: 'Travel', text: 'Borobudur Temple is located in which Indonesian province?', options: ['Central Java', 'West Java', 'East Java', 'Bali'], answer: 0, note: 'Borobudur stands in Magelang Regency, Central Java.' },
  { category: 'Culture', text: 'The traditional Tongkonan house is associated with which community?', options: ['Minangkabau', 'Baduy', 'Toraja', 'Betawi'], answer: 2, note: 'Tongkonan is the ancestral house of the Toraja people of South Sulawesi.' },
  { category: 'Food', text: 'Papeda, a sago-based staple from eastern Indonesia, is commonly served with…', options: ['Yellow-spiced fish soup', 'Rendang', 'Sambal matah', 'Serabi'], answer: 0, note: 'Papeda is a sago porridge often paired with fish in a turmeric-yellow broth.' },
  { category: 'Travel', text: 'Lake Toba is located in which province?', options: ['West Sumatra', 'North Sumatra', 'Aceh', 'Riau'], answer: 1, note: 'Lake Toba is a vast volcanic lake in North Sumatra, with Samosir Island at its center.' },
  { category: 'Culture', text: 'The rhythmic “cak” chant of the Kecak dance comes from…', options: ['Bali', 'Lombok', 'East Kalimantan', 'Central Java'], answer: 0, note: 'Kecak developed in Bali and often tells stories from the Ramayana.' },
  { category: 'Food', text: 'Pempek, often served with tangy cuko sauce, is a specialty of…', options: ['Palembang', 'Padang', 'Manado', 'Cirebon'], answer: 0, note: 'Palembang’s fish-and-tapioca cakes are traditionally served with sweet-sour cuko.' },
  { category: 'Travel', text: 'Komodo National Park is in which province?', options: ['East Nusa Tenggara', 'West Nusa Tenggara', 'Maluku', 'North Sulawesi'], answer: 0, note: 'Komodo National Park lies in East Nusa Tenggara and protects the famous Komodo dragon.' },
  { category: 'Culture', text: 'How do you play an angklung?', options: ['Pluck it', 'Bow it', 'Shake it', 'Blow into it'], answer: 2, note: 'An angklung is a bamboo instrument that makes music when shaken.' },
  { category: 'Food', text: 'Bika Ambon is a popular cake souvenir from which city?', options: ['Medan', 'Makassar', 'Banjarmasin', 'Surabaya'], answer: 0, note: 'Despite its name, Bika Ambon is especially associated with Medan in North Sumatra.' }
];

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, answered: Boolean(p.answer) })),
    questionIndex: room.questionIndex,
    question: ['question', 'reveal'].includes(room.status) ? (({ answer, note, ...safe }) => safe)(questions[room.questionIndex]) : null,
    answer: room.status === 'reveal' ? questions[room.questionIndex].answer : null,
    note: room.status === 'reveal' ? questions[room.questionIndex].note : null,
    endsAt: room.endsAt,
    totalQuestions: questions.length
  };
}

function publish(room) { io.to(room.code).emit('room:update', publicRoom(room)); }

function startQuestion(room) {
  if (room.questionIndex >= questions.length) {
    room.status = 'finished'; room.endsAt = null; publish(room); return;
  }
  room.status = 'question'; room.endsAt = Date.now() + QUESTION_MS;
  for (const player of room.players.values()) player.answer = null;
  publish(room);
  clearTimeout(room.timer);
  room.timer = setTimeout(() => reveal(room), QUESTION_MS);
}

function reveal(room) {
  if (room.status !== 'question') return;
  room.status = 'reveal'; room.endsAt = Date.now() + REVEAL_MS;
  publish(room);
  clearTimeout(room.timer);
  room.timer = setTimeout(() => { room.questionIndex += 1; startQuestion(room); }, REVEAL_MS);
}

function createCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); } while (rooms.has(code));
  return code;
}

io.on('connection', socket => {
  socket.on('room:create', ({ name }, done = () => {}) => {
    const playerName = String(name || '').trim().slice(0, 18);
    if (!playerName) return done({ error: 'Enter a player name.' });
    const code = createCode();
    const room = { code, hostId: socket.id, status: 'lobby', players: new Map(), questionIndex: 0, endsAt: null, timer: null };
    room.players.set(socket.id, { id: socket.id, name: playerName, score: 0, answer: null });
    rooms.set(code, room); socket.join(code); socket.data.roomCode = code;
    done({ room: publicRoom(room) });
    publish(room);
  });

  socket.on('room:join', ({ code, name }, done = () => {}) => {
    const roomCode = String(code || '').trim().toUpperCase();
    const playerName = String(name || '').trim().slice(0, 18);
    const room = rooms.get(roomCode);
    if (!playerName) return done({ error: 'Enter a player name.' });
    if (!room) return done({ error: 'Room code not found.' });
    if (room.status !== 'lobby') return done({ error: 'The game has already started.' });
    if (room.players.size >= 8) return done({ error: 'This room is full (maximum 8 players).' });
    room.players.set(socket.id, { id: socket.id, name: playerName, score: 0, answer: null });
    socket.join(roomCode); socket.data.roomCode = roomCode;
    done({ room: publicRoom(room) }); publish(room);
  });

  socket.on('game:start', done => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return done?.({ error: 'Room not found.' });
    if (room.hostId !== socket.id) return done?.({ error: 'Only the host can start the game.' });
    if (room.status !== 'lobby') return done?.({ error: 'The game is already in progress.' });
    room.questionIndex = 0;
    for (const player of room.players.values()) player.score = 0;
    done?.({ ok: true }); startQuestion(room);
  });

  socket.on('answer:submit', ({ choice }, done = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    const player = room?.players.get(socket.id);
    if (!room || !player || room.status !== 'question') return done({ error: 'This question is no longer accepting answers.' });
    if (player.answer !== null) return done({ error: 'Your answer is already locked.' });
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return done({ error: 'Invalid answer choice.' });
    const elapsed = Math.max(0, QUESTION_MS - Math.max(0, room.endsAt - Date.now()));
    player.answer = choice;
    if (choice === questions[room.questionIndex].answer) {
      player.score += Math.max(1, Math.ceil(100 * (1 - elapsed / QUESTION_MS)));
    }
    done({ ok: true }); publish(room);
    if ([...room.players.values()].every(p => p.answer !== null)) reveal(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    room.players.delete(socket.id);
    if (room.players.size === 0) { clearTimeout(room.timer); rooms.delete(room.code); return; }
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    publish(room);
  });
});

server.listen(PORT, () => console.log(`Trivia Nusantara berjalan di http://localhost:${PORT}`));
