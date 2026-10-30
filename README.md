# Trivia Nusantara: An Indonesian Culture Quiz

A real-time quiz for 1–8 players. Create a room and share its code, or play solo. Everyone sees the same question, answers within 15 seconds, and sees the correct answer, a short cultural note, and the leaderboard after each round. Faster correct answers earn more points.

The English-language interface uses an original batik-inspired pattern and a vector illustration of temple architecture, volcanic islands, and ocean waves. The question set explores Indonesian food, landmarks, and living culture.

## Run locally with Netlify Dev

1. Install Node.js 20 or newer.
2. Run `npm install` from this folder.
3. Run `npm start`.
4. Open the local URL shown by Netlify Dev (usually `http://localhost:8888`).

Netlify Dev runs the static game and its serverless function together. The local Blobs store is sandboxed; it is separate from any production data.

## Deploy to Netlify

1. Sign in with `npx netlify login` if the CLI says you are not logged in.
2. Link or create a Netlify site with `npx netlify link` or `npx netlify deploy --prod`.
3. For later updates, push to the connected GitHub branch or run `npm run deploy`.

The game function is at `netlify/functions/game.mjs`. It stores each room in a strongly consistent Netlify Blobs store in Singapore and uses conditional writes to avoid overwriting another player's simultaneous update. The browser polls the function directly for room state. No environment variables or manual database setup are required.

## Finish the project submission

1. Create a room, join from a second tab, and play a few rounds. Solo play is also supported.
2. Open the public Netlify URL in regular and private windows and confirm the game loads.
3. Upload a screenshot of a key game screen and use the copy-ready project details in `PROJECT-SUBMISSION.md`.
4. Paste the public URL into the mission's **Submit** form. Choose whether to share the project publicly in Showcase.

Correct answers score `ceil(100 × remaining time / 15 seconds)`, with a minimum of 1 point. Incorrect answers and timeouts score 0.
