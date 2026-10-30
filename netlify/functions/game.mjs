import { getStore } from "@netlify/blobs";

const QUESTION_MS = 15_000;
const REVEAL_MS = 5_000;
const ROOM_LIMIT = 8;
const TOTAL_QUESTIONS = 10;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = getStore({
  name: "trivia-nusantara-rooms",
  consistency: "strong",
  region: "ap-southeast-1",
});

const questions = [
  { category: "Food", text: "Which Yogyakarta specialty is made from young jackfruit slowly cooked in coconut milk?", options: ["Rawon", "Gudeg", "Coto Makassar", "Pempek"], answer: 1, note: "Gudeg is one of Yogyakarta’s best-known dishes, traditionally served with rice and savory sides." },
  { category: "Travel", text: "Borobudur Temple is located in which Indonesian province?", options: ["Central Java", "West Java", "East Java", "Bali"], answer: 0, note: "Borobudur stands in Magelang Regency, Central Java." },
  { category: "Culture", text: "The traditional Tongkonan house is associated with which community?", options: ["Minangkabau", "Baduy", "Toraja", "Betawi"], answer: 2, note: "Tongkonan is the ancestral house of the Toraja people of South Sulawesi." },
  { category: "Food", text: "Papeda, a sago-based staple from eastern Indonesia, is commonly served with…", options: ["Yellow-spiced fish soup", "Rendang", "Sambal matah", "Serabi"], answer: 0, note: "Papeda is a sago porridge often paired with fish in a turmeric-yellow broth." },
  { category: "Travel", text: "Lake Toba is located in which province?", options: ["West Sumatra", "North Sumatra", "Aceh", "Riau"], answer: 1, note: "Lake Toba is a vast volcanic lake in North Sumatra, with Samosir Island at its center." },
  { category: "Culture", text: "The rhythmic “cak” chant of the Kecak dance comes from…", options: ["Bali", "Lombok", "East Kalimantan", "Central Java"], answer: 0, note: "Kecak developed in Bali and often tells stories from the Ramayana." },
  { category: "Food", text: "Pempek, often served with tangy cuko sauce, is a specialty of…", options: ["Palembang", "Padang", "Manado", "Cirebon"], answer: 0, note: "Palembang’s fish-and-tapioca cakes are traditionally served with sweet-sour cuko." },
  { category: "Travel", text: "Komodo National Park is in which province?", options: ["East Nusa Tenggara", "West Nusa Tenggara", "Maluku", "North Sulawesi"], answer: 0, note: "Komodo National Park lies in East Nusa Tenggara and protects the famous Komodo dragon." },
  { category: "Culture", text: "How do you play an angklung?", options: ["Pluck it", "Bow it", "Shake it", "Blow into it"], answer: 2, note: "An angklung is a bamboo instrument that makes music when shaken." },
  { category: "Food", text: "Bika Ambon is a popular cake souvenir from which city?", options: ["Medan", "Makassar", "Banjarmasin", "Surabaya"], answer: 0, note: "Despite its name, Bika Ambon is especially associated with Medan in North Sumatra." },
];

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function getPublicRoom(room) {
  const active = room.status === "question" || room.status === "reveal";
  const current = active ? questions[room.questionIndex] : null;
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map(({ id, name, score, answer }) => ({ id, name, score, answered: answer !== null })),
    questionIndex: room.questionIndex,
    question: current ? { category: current.category, text: current.text, options: current.options } : null,
    answer: room.status === "reveal" ? current.answer : null,
    note: room.status === "reveal" ? current.note : null,
    endsAt: room.endsAt,
    totalQuestions: TOTAL_QUESTIONS,
  };
}

function makeCode() {
  return Array.from({ length: 5 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join("");
}

function validName(name) {
  return typeof name === "string" && name.trim().length > 0 && name.trim().length <= 18;
}

function validPlayerId(id) {
  return typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id);
}

function validCode(code) {
  return typeof code === "string" && /^[A-HJ-NP-Z2-9]{5}$/i.test(code);
}

async function createRoom(name, playerId) {
  const now = Date.now();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = makeCode();
    const room = {
      code,
      hostId: playerId,
      status: "lobby",
      players: [{ id: playerId, name: name.trim(), score: 0, answer: null }],
      questionIndex: 0,
      endsAt: null,
      createdAt: now,
    };
    const result = await rooms.setJSON(code, room, { onlyIfNew: true });
    if (result.modified) return { room: getPublicRoom(room) };
  }
  return { error: "Could not create a room. Please try again." };
}

async function updateRoom(code, mutate) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const entry = await rooms.getWithMetadata(code, { type: "json" });
    if (!entry?.data) return { error: "Room code not found.", status: 404 };

    const room = entry.data;
    const result = mutate(room);
    if (result?.error) {
      if (result.changed) {
        const stored = await rooms.setJSON(code, room, { onlyIfMatch: entry.etag });
        if (!stored.modified) continue;
      }
      return { error: result.error, status: result.status || 400 };
    }
    if (result?.changed === false) return { room };

    const stored = await rooms.setJSON(code, room, { onlyIfMatch: entry.etag });
    if (stored.modified) return { room };
    await new Promise(resolve => setTimeout(resolve, 15 + Math.random() * 35));
  }
  return { error: "The room is busy. Please try again.", status: 409 };
}

async function advanceRoom(code) {
  return updateRoom(code, room => {
    const now = Date.now();
    if (room.status === "question" && room.endsAt <= now) {
      room.status = "reveal";
      room.endsAt = now + REVEAL_MS;
      return { changed: true };
    }
    if (room.status === "reveal" && room.endsAt <= now) {
      room.questionIndex += 1;
      if (room.questionIndex >= TOTAL_QUESTIONS) {
        room.status = "finished";
        room.endsAt = null;
      } else {
        room.status = "question";
        room.endsAt = now + QUESTION_MS;
        room.players.forEach(player => { player.answer = null; });
      }
      return { changed: true };
    }
    return { changed: false };
  });
}

async function handlePost(body) {
  const { action, code, name, playerId, choice } = body;
  if (!validPlayerId(playerId)) return { error: "Your player session is invalid. Refresh and try again.", status: 400 };

  if (action === "create") {
    if (!validName(name)) return { error: "Enter a name with 1–18 characters.", status: 400 };
    return createRoom(name, playerId);
  }

  if (!validCode(code)) return { error: "Enter a valid 5-character room code.", status: 400 };
  if (action === "join") {
    if (!validName(name)) return { error: "Enter a name with 1–18 characters.", status: 400 };
    return updateRoom(code.toUpperCase(), room => {
      if (room.status !== "lobby") return { error: "The game has already started." };
      if (room.players.some(player => player.id === playerId)) return { changed: false };
      if (room.players.length >= ROOM_LIMIT) return { error: "This room is full (maximum 8 players)." };
      room.players.push({ id: playerId, name: name.trim(), score: 0, answer: null });
      return { changed: true };
    }).then(result => result.room ? { room: getPublicRoom(result.room) } : result);
  }

  if (action === "start") {
    const advanced = await advanceRoom(code.toUpperCase());
    if (advanced.error) return advanced;
    return updateRoom(code.toUpperCase(), room => {
      if (room.hostId !== playerId) return { error: "Only the host can start the game." };
      if (room.status !== "lobby") return { error: "The game has already started." };
      room.questionIndex = 0;
      room.players.forEach(player => { player.score = 0; player.answer = null; });
      room.status = "question";
      room.endsAt = Date.now() + QUESTION_MS;
      return { changed: true };
    }).then(result => result.room ? { room: getPublicRoom(result.room) } : result);
  }

  if (action === "answer") {
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return { error: "Invalid answer choice.", status: 400 };
    const advanced = await advanceRoom(code.toUpperCase());
    if (advanced.error) return advanced;
    return updateRoom(code.toUpperCase(), room => {
      const player = room.players.find(entry => entry.id === playerId);
      if (!player) return { error: "You are not in this room.", status: 403 };
      if (room.status !== "question") return { error: "This question is no longer accepting answers." };
      if (player.answer !== null) return { error: "Your answer is already locked." };
      player.answer = choice;
      if (choice === questions[room.questionIndex].answer) {
        const remaining = Math.max(0, room.endsAt - Date.now());
        player.score += Math.max(1, Math.ceil(100 * remaining / QUESTION_MS));
      }
      if (room.players.every(entry => entry.answer !== null)) {
        room.status = "reveal";
        room.endsAt = Date.now() + REVEAL_MS;
      }
      return { changed: true };
    }).then(result => result.room ? { room: getPublicRoom(result.room) } : result);
  }

  return { error: "Unknown game action.", status: 400 };
}

export default async request => {
  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const code = url.searchParams.get("code")?.toUpperCase();
      const playerId = url.searchParams.get("playerId");
      if (!validCode(code) || !validPlayerId(playerId)) return json({ error: "Invalid room or player session." }, 400);
      const advanced = await advanceRoom(code);
      if (advanced.error) return json({ error: advanced.error }, advanced.status || 404);
      if (!advanced.room.players.some(player => player.id === playerId)) return json({ error: "You are not in this room." }, 403);
      return json({ room: getPublicRoom(advanced.room) });
    }

    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const body = await request.json();
    const result = await handlePost(body);
    if (result.error) return json({ error: result.error }, result.status || 400);
    return json(result);
  } catch (error) {
    console.error("Trivia function error:", error);
    return json({ error: "The game service is temporarily unavailable. Please try again." }, 500);
  }
};
