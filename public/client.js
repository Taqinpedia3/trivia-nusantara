const API_URL = "/.netlify/functions/game";
const $ = id => document.getElementById(id);
const playerId = sessionStorage.getItem("nusa-player-id") || crypto.randomUUID();
sessionStorage.setItem("nusa-player-id", playerId);

let mode = "create";
let currentRoom = null;
let selectedAnswer = null;
let renderedPhase = null;
let ticker = null;
let poller = null;
let toastTimer = null;
let pollInFlight = false;
let lastNetworkToast = 0;

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(item => item.classList.toggle("active", item === tab));
  mode = tab.dataset.tab;
  $("code-field").classList.toggle("hidden", mode !== "join");
  $("room-code").required = mode === "join";
  $("room-submit").innerHTML = `${mode === "create" ? "Create a room" : "Join a room"} <span>↗</span>`;
  $("form-error").textContent = "";
}));

$("room-form").addEventListener("submit", async event => {
  event.preventDefault();
  $("form-error").textContent = "";
  const action = mode === "create" ? "create" : "join";
  const payload = { action, playerId, name: $("player-name").value.trim() };
  if (mode === "join") payload.code = $("room-code").value.trim().toUpperCase();
  try {
    const result = await post(payload);
    $("landing").classList.add("hidden");
    $("game").classList.remove("hidden");
    updateRoom(result.room);
    startPolling();
  } catch (error) {
    $("form-error").textContent = error.message;
  }
});

async function post(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}

function startPolling() {
  clearInterval(poller);
  pollRoom();
  poller = setInterval(pollRoom, 900);
}

async function pollRoom() {
  if (!currentRoom || pollInFlight) return;
  pollInFlight = true;
  try {
    const query = new URLSearchParams({ code: currentRoom.code, playerId });
    const response = await fetch(`${API_URL}?${query}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || "Could not refresh the room.");
    updateRoom(result.room);
  } catch (error) {
    const now = Date.now();
    if (now - lastNetworkToast > 8_000) {
      showToast(error.message === "Failed to fetch" ? "Connection lost. Reconnecting…" : error.message);
      lastNetworkToast = now;
    }
  } finally {
    pollInFlight = false;
  }
}

function updateRoom(room) {
  currentRoom = room;
  $("room-code-display").textContent = room.code;
  $("player-count").textContent = `${room.players.length} / 8`;
  renderPlayers(room);
  $("lobby-panel").classList.toggle("hidden", room.status !== "lobby");
  $("question-panel").classList.toggle("hidden", room.status !== "question");
  $("reveal-panel").classList.toggle("hidden", room.status !== "reveal");
  $("finished-panel").classList.toggle("hidden", room.status !== "finished");
  $("phase-title").textContent = room.status === "lobby" ? "Waiting room" : room.status === "finished" ? "Final results" : `Question ${Math.min(room.questionIndex + 1, room.totalQuestions)} of ${room.totalQuestions}`;

  if (room.status === "lobby") {
    $("start-game").classList.toggle("hidden", room.hostId !== playerId);
    $("start-hint").textContent = room.players.length === 1 ? "Solo mode is ready. Start whenever you like." : "Everyone ready? The host can start the game.";
  }

  const phaseKey = `${room.status}:${room.questionIndex}`;
  if (phaseKey !== renderedPhase) {
    renderedPhase = phaseKey;
    if (room.status === "question") renderQuestion(room);
    if (room.status === "reveal") renderReveal(room);
    if (room.status === "finished") {
      clearInterval(ticker);
      clearInterval(poller);
      renderFinished(room);
    }
  } else if (room.status === "question") {
    $("answered-count").textContent = room.players.filter(player => player.answered).length;
    tick(room.endsAt);
  }
}

function renderPlayers(room) {
  $("player-list").innerHTML = room.players.map((player, index) => `<li class="player-row"><span class="avatar">${["✦","✿","☼","❋","✺","◆","◈","✧"][index]}</span><span class="player-name">${escapeHtml(player.name)}</span>${player.id === room.hostId ? '<span class="host-tag">HOST</span>' : ""}</li>`).join("");
  $("answered-count").textContent = room.players.filter(player => player.answered).length;
}

function renderQuestion(room) {
  selectedAnswer = null;
  const question = room.question;
  if (!question) return;
  $("question-category").textContent = question.category.toUpperCase();
  $("round-label").textContent = `QUESTION ${room.questionIndex + 1} / ${room.totalQuestions}`;
  $("question-text").textContent = question.text;
  $("answer-status").textContent = "Choose your answer. Your choice stays hidden until the round ends.";
  $("answer-list").innerHTML = question.options.map((option, index) => `<button class="answer-option" data-choice="${index}"><span class="answer-letter">${"ABCD"[index]}</span><span>${escapeHtml(option)}</span></button>`).join("");
  $("answer-list").querySelectorAll("button").forEach(button => button.addEventListener("click", () => submitAnswer(Number(button.dataset.choice))));
  clearInterval(ticker);
  tick(room.endsAt);
  ticker = setInterval(() => tick(currentRoom.endsAt), 100);
}

function tick(endsAt) {
  const remaining = Math.max(0, endsAt - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  $("timer").textContent = seconds;
  $("timer").classList.toggle("urgent", seconds <= 5);
  $("progress").style.width = `${Math.max(0, remaining / 15_000 * 100)}%`;
  if (remaining <= 0) clearInterval(ticker);
}

async function submitAnswer(choice) {
  if (selectedAnswer !== null) return;
  selectedAnswer = choice;
  document.querySelectorAll(".answer-option").forEach(button => {
    button.disabled = true;
    if (Number(button.dataset.choice) === choice) button.classList.add("selected");
  });
  $("answer-status").textContent = "Answer locked. Waiting for the other players…";
  try {
    const result = await post({ action: "answer", code: currentRoom.code, playerId, choice });
    updateRoom(result.room);
  } catch (error) {
    $("answer-status").textContent = error.message;
  }
}

function renderReveal(room) {
  clearInterval(ticker);
  const question = room.question;
  if (!question) return;
  $("reveal-round").textContent = `QUESTION ${room.questionIndex + 1} / ${room.totalQuestions}`;
  $("correct-answer").textContent = `${"ABCD"[room.answer]}. ${question.options[room.answer]}`;
  $("answer-note").textContent = room.note || "";
  renderScores(room, "score-list");
}

function renderScores(room, elementId) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  $(elementId).innerHTML = sorted.map((player, index) => `<li class="score-row"><span class="rank ${index === 0 ? "first" : ""}">${String(index + 1).padStart(2, "0")}</span><span class="avatar">${["✦","✿","☼","❋","✺","◆","◈","✧"][index]}</span><span class="score-name">${escapeHtml(player.name)}${player.id === playerId ? " <small>(you)</small>" : ""}</span><span class="score-value">${player.score}<span class="score-delta">pts</span></span></li>`).join("");
}

function renderFinished(room) {
  const winner = [...room.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))[0];
  $("winner-title").textContent = winner ? `${winner.name} is the Nusantara champion!` : "Game complete!";
  $("winner-subtitle").textContent = winner ? `Top score: ${winner.score} points. Thanks for exploring Indonesia together!` : "Thanks for playing!";
  renderScores(room, "final-score-list");
}

$("start-game").addEventListener("click", async () => {
  try {
    const result = await post({ action: "start", code: currentRoom.code, playerId });
    updateRoom(result.room);
  } catch (error) {
    showToast(error.message);
  }
});

$("copy-code").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentRoom.code);
    showToast("Room code copied!");
  } catch {
    showToast(`Share this code: ${currentRoom.code}`);
  }
});

$("play-again").addEventListener("click", () => location.reload());

function showToast(text) {
  $("toast").textContent = text;
  $("toast").classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 2_300);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
