const socket = io();
const $ = id => document.getElementById(id);
let mode = 'create';
let currentRoom = null;
let selectedAnswer = null;
let ticker = null;
let toastTimer = null;

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
  mode = tab.dataset.tab;
  $('code-field').classList.toggle('hidden', mode !== 'join');
  $('room-code').required = mode === 'join';
  $('room-submit').innerHTML = `${mode === 'create' ? 'Create a room' : 'Join a room'} <span>↗</span>`;
  $('form-error').textContent = '';
}));

$('room-form').addEventListener('submit', event => {
  event.preventDefault();
  $('form-error').textContent = '';
  const payload = { name: $('player-name').value.trim() };
  const action = mode === 'create' ? 'room:create' : 'room:join';
  if (mode === 'join') payload.code = $('room-code').value.trim().toUpperCase();
  socket.emit(action, payload, result => {
    if (result?.error) { $('form-error').textContent = result.error; return; }
    $('landing').classList.add('hidden'); $('game').classList.remove('hidden');
    updateRoom(result.room);
  });
});

socket.on('room:update', updateRoom);

function updateRoom(room) {
  currentRoom = room;
  $('room-code-display').textContent = room.code;
  $('player-count').textContent = `${room.players.length} / 8`;
  renderPlayers(room);
  $('lobby-panel').classList.toggle('hidden', room.status !== 'lobby');
  $('question-panel').classList.toggle('hidden', room.status !== 'question');
  $('reveal-panel').classList.toggle('hidden', room.status !== 'reveal');
  $('finished-panel').classList.toggle('hidden', room.status !== 'finished');
  $('phase-title').textContent = room.status === 'lobby' ? 'Waiting room' : room.status === 'finished' ? 'Final results' : `Question ${Math.min(room.questionIndex + 1, room.totalQuestions)} of ${room.totalQuestions}`;
  if (room.status === 'lobby') {
    $('start-game').classList.toggle('hidden', room.hostId !== socket.id);
    $('start-hint').textContent = room.players.length === 1 ? 'Solo mode is ready. Start whenever you like.' : 'Everyone ready? The host can start the game.';
    $('start-game').disabled = false;
    $('start-game').style.opacity = '1';
  }
  if (room.status === 'question') renderQuestion(room);
  if (room.status === 'reveal') renderReveal(room);
  if (room.status === 'finished') renderFinished(room);
}

function renderPlayers(room) {
  $('player-list').innerHTML = room.players.map((p, i) => `<li class="player-row"><span class="avatar">${['✦','✿','☼','❋','✺','◆','◈','✧'][i]}</span><span class="player-name">${escapeHtml(p.name)}</span>${p.id === room.hostId ? '<span class="host-tag">HOST</span>' : ''}</li>`).join('');
  $('answered-count').textContent = room.players.filter(p => p.answered).length;
}

function renderQuestion(room) {
  selectedAnswer = null;
  const q = room.question;
  if (!q) return;
  $('question-category').textContent = q.category.toUpperCase();
  $('round-label').textContent = `QUESTION ${room.questionIndex + 1} / ${room.totalQuestions}`;
  $('question-text').textContent = q.text;
  $('answer-status').textContent = 'Choose your answer. Your choice stays hidden until the round ends.';
  $('answer-list').innerHTML = q.options.map((option, i) => `<button class="answer-option" data-choice="${i}"><span class="answer-letter">${'ABCD'[i]}</span><span>${escapeHtml(option)}</span></button>`).join('');
  $('answer-list').querySelectorAll('button').forEach(button => button.addEventListener('click', () => submitAnswer(Number(button.dataset.choice))));
  clearInterval(ticker); tick(room.endsAt);
  ticker = setInterval(() => tick(room.endsAt), 100);
}

function tick(endsAt) {
  const remaining = Math.max(0, endsAt - Date.now());
  const secs = Math.ceil(remaining / 1000);
  $('timer').textContent = secs;
  $('timer').classList.toggle('urgent', secs <= 5);
  $('progress').style.width = `${Math.max(0, remaining / 15000 * 100)}%`;
  if (remaining <= 0) clearInterval(ticker);
}

function submitAnswer(choice) {
  if (selectedAnswer !== null) return;
  selectedAnswer = choice;
  document.querySelectorAll('.answer-option').forEach(button => {
    button.disabled = true;
    if (Number(button.dataset.choice) === choice) button.classList.add('selected');
  });
  $('answer-status').textContent = 'Answer locked. Waiting for the other players…';
  socket.emit('answer:submit', { choice }, result => {
    if (result?.error) { $('answer-status').textContent = result.error; }
  });
}

function renderReveal(room) {
  clearInterval(ticker);
  const q = room.question;
  if (!q) return;
  $('reveal-round').textContent = `QUESTION ${room.questionIndex + 1} / ${room.totalQuestions}`;
  $('correct-answer').textContent = `${'ABCD'[room.answer]}. ${q.options[room.answer]}`;
  $('answer-note').textContent = room.note || '';
  renderScores(room, 'score-list');
}

function renderScores(room, elementId) {
  const sorted = [...room.players].sort((a,b) => b.score - a.score || a.name.localeCompare(b.name));
  $(elementId).innerHTML = sorted.map((p, i) => `<li class="score-row"><span class="rank ${i === 0 ? 'first' : ''}">${String(i + 1).padStart(2,'0')}</span><span class="avatar">${['✦','✿','☼','❋','✺','◆','◈','✧'][i]}</span><span class="score-name">${escapeHtml(p.name)}${p.id === socket.id ? ' <small>(you)</small>' : ''}</span><span class="score-value">${p.score}<span class="score-delta">pts</span></span></li>`).join('');
}

function renderFinished(room) {
  clearInterval(ticker);
  const sorted = [...room.players].sort((a,b) => b.score - a.score || a.name.localeCompare(b.name));
  const winner = sorted[0];
  $('winner-title').textContent = winner ? `${winner.name} is the Nusantara champion!` : 'Game complete!';
  $('winner-subtitle').textContent = winner ? `Top score: ${winner.score} points. Thanks for exploring Indonesia together!` : 'Thanks for playing!';
  renderScores(room, 'final-score-list');
}

$('start-game').addEventListener('click', () => socket.emit('game:start', result => { if (result?.error) showToast(result.error); }));
$('copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentRoom.code); showToast('Room code copied!'); }
  catch { showToast(`Share this code: ${currentRoom.code}`); }
});
$('play-again').addEventListener('click', () => location.reload());

function showToast(text) {
  $('toast').textContent = text; $('toast').classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 2300);
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }

socket.on('disconnect', () => showToast('Connection lost. Reconnecting…'));
