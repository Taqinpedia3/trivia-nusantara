# Trivia Nusantara: An Indonesian Culture Quiz

A real-time quiz for 1–8 players. Create a room and share its code, or play solo. Everyone sees the same question, answers within 15 seconds, and sees the correct answer, a short cultural note, and the live leaderboard after each round. Faster correct answers earn more points.

The English-language interface uses an original batik-inspired pattern and a vector illustration of temple architecture, volcanic islands, and ocean waves. The question set explores Indonesian food, landmarks, and living culture.

## Run locally

1. Install Node.js 20 or newer.
2. From this project folder, run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

Open the address in two tabs to try a host and a joining player. For friends to join from other devices, deploy the Node.js app to a host that supports WebSockets. Rooms are kept in server memory and end if the server restarts; all players must connect to the same server instance.

## Finish the project submission

1. Create a room, join from another tab, and play a few rounds.
2. Deploy the app and its `public/` folder to a Node.js host with WebSocket support.
3. Open the public URL in regular and private windows and make sure the game loads.
4. Upload a screenshot of a key game screen and use the copy-ready project details in `PROJECT-SUBMISSION.md`.
5. Paste the public URL into the mission's **Submit** form. Choose whether to share the project publicly in Showcase.

Correct answers score `ceil(100 × remaining time / 15 seconds)`, with a minimum of 1 point. Incorrect answers and timeouts score 0.
