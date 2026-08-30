# wreckage-clips

Hover-preview clip library for **WRECKAGE.SYS** — 45 single-effect reference clips
(Seedance 2.0, 4s, 21:9), one per camera move / world warp, across three THE SIGNAL
frames. Served to the app via jsDelivr:

`https://cdn.jsdelivr.net/gh/xantrans420/wreckage-clips@main/clips/<slug>.mp4`

Filenames match `clipSlug(name)` in the app so each picker cell resolves its clip on hover.

---

## WRECKAGE.TV — the infinite channel (`channel.html`)

An always-on AI TV channel: clips play back-to-back forever, and whatever viewers
type in chat becomes the next shot, chained onto the one before it so the channel
tells a continuous story instead of showing 40 unrelated renders.

Open `channel.html`. It runs in one of two modes.

### LIBRARY MODE — no setup, works on GitHub Pages

With no render backend configured the channel airs the 53-clip reference deck on
shuffle, forever. Chat still steers it: a prompt is keyword-matched against every
camera move and world warp, and the closest one airs next, chyroned with the name
of whoever asked for it. Good for proving the format, and as the fallback when a
render is in flight.

### LIVE MODE — chat prompts become new footage

Put the WRECKAGE `/api` base URL (the same backend the SYS app renders through)
into **DIRECTOR → RENDER BACKEND**. Now every request is generated:

1. A viewer's line is composed into a Seedance shot — by Claude if an Anthropic
   key is set, otherwise by a local composer that glues the request to a camera
   move from the deck.
2. It's submitted to `POST /api/video` and polled at `GET /api/video/:taskId` —
   the exact contract `index.html` already uses.
3. The finished clip goes on deck. Library clips fill the gap while it renders,
   so the channel never shows black.
4. Its **last frame is captured and fed into the next shot** as the opening
   frame, and the beat is appended to the story the director sees. That's the
   continuity: the next request lands in the world the last one left behind.

Chaining runs strictly one render at a time — a story that renders in parallel
isn't a story. If the video host serves no CORS headers the frame grab returns
nothing, the channel says so once, and chaining continues on story text alone.

### Where viewer prompts come from

- **The chat box** in the page.
- **Twitch** — put a channel name in DIRECTOR and hit CONNECT. Anonymous
  read-only IRC over WebSocket (`justinfan`), no token, no login, no backend.
  Every message in that channel becomes a scene request.
- **Any bot or parent page** — `window.WRECKAGE.submit(user, text)`, or
  `postMessage({type:'wreckage:prompt', user, text})` from an embedding page.
  `window.WRECKAGE.state()` reports mode, buffer, render count and what's on air.

Set a **command prefix** (default `!`) so only `!a cat detective visits kazakhstan`
gets queued and ordinary chatter just scrolls past. Blank means every line counts.

### Streaming it

Press **B** (or the BROADCAST button) and the operator chrome disappears: full-bleed
feed, channel bug, lower third naming the shot and who requested it, and a ticker of
incoming requests. That's the OBS Browser Source view. `?broadcast=1` boots straight
into it.

Keys: `SPACE` on/off air · `N` cut to next · `M` mute · `B` broadcast · `/` focus chat.

URL params: `?backend=…&twitch=…&prefix=!&broadcast=1&autopilot=1&chain=0&buffer=3&duration=5&aspect=16:9&res=720p`

### Cost

Every generated shot is a paid render, and a channel eats one every few seconds.
The guards, all in DIRECTOR:

- **AUTOPILOT is off by default** — with nobody prompting, the channel airs library
  clips for free instead of generating on idle. Turn it on and it writes its own
  continuations, at cost.
- **RENDER CAP** (default 40) hard-stops generation for the session.
- **BUFFER AHEAD** (default 2) bounds how far ahead it renders.
- Resolution and shot length are the other two dials — 480p buys buffer.

The Anthropic key is only stored in the browser if you tick REMEMBER KEY, and it's
sent direct from the browser to `api.anthropic.com` (same as the SYS app). Director
calls run on `claude-opus-5` at low effort with server-side refusal fallback on, so a
declined request degrades to the local composer instead of stalling the channel.
