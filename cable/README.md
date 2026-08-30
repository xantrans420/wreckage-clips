# CABLE

A channel that never stops. Every shot is generated on demand by **MiniMax H3 Max**
on fal.ai — nothing is pre-recorded, there is no clip library — and whatever viewers
type in chat becomes the next shot of a scene that is already running.

One file: `index.html`. No build, no server, no dependencies.

## Why it works

H3 Max renders faster than the channel plays, so the buffer stays ahead of the
broadcast. That's the whole premise — a channel made of footage that doesn't exist
until a moment before you see it.

Continuity is the model's own, not a trick layered on top:

- The **opening shot** is `minimax/h3-max/text-to-video`.
- **Every shot after it** is `minimax/h3-max/image-to-video`, starting on the last
  frame of the shot before it — captured off the video, passed back as a data URI.

So a viewer request doesn't start a new video. It lands in the room the last shot
left them in.

## Running it

Open `index.html`, click to tune in, and add a fal key in **SETUP**. Nothing renders
until you tune in — an open tab with a saved key doesn't quietly spend.

Two ways to reach fal:

- **FAL KEY** — straight from the browser to `queue.fal.run`. Fine on your own
  machine, where the key never leaves it.
- **PROXY URL** — any fal proxy (`@fal-ai/server-proxy`, a Cloudflare worker, an AI
  gateway). Requests go to your proxy with the real target in `x-fal-target-url`
  and the key stays server-side. Use this if the page is hosted anywhere public.

## Who can direct it

- The **chat box** in the page.
- **Twitch** — put a channel name in SETUP and hit CONNECT. Anonymous read-only IRC
  over WebSocket, no token and no backend. Every viewer message becomes a request.
- **Any bot or parent page** — `window.CABLE.submit(user, text)` or
  `postMessage({type:'cable:prompt', user, text})`. `window.CABLE.state()` reports
  what's on air, what's buffered and how many seconds have been generated.

A **command prefix** (default `!`) keeps ordinary chatter out of the render queue.
Blank means every line counts.

## Streaming it

Press **B** and the operator chrome disappears: full-bleed feed, channel bug, chyron
naming the shot and who asked for it, and a ticker of incoming requests. That's the
OBS Browser Source view — `?broadcast=1` boots straight into it.

Keys: `SPACE` on/off air · `N` next · `M` mute · `B` broadcast · `/` focus chat.

URL params: `?proxy=…&twitch=…&prefix=!&broadcast=1&duration=10&res=480P&aspect=21:9&autopilot=0&chain=0&buffer=3&cap=50&look=…`

## Settings worth knowing

**CHANNEL LOOK** is appended to every prompt — it's what makes the channel feel like
one channel instead of a shuffle. Default: *cinematic, film grain, natural light*.

**KEEP ROLLING** (autopilot, on by default) writes the channel's own next shot when
chat is quiet. Turn it off and the channel idles on the last shot until someone
prompts — cheaper, but it stops being infinite.

**SHOT LENGTH / RESOLUTION** are the two dials that decide whether generation keeps
ahead of playback. 480P and short shots buy the most buffer.

**PROMPT EXPANSION** — `balanced` (~1s) keeps up with a live channel. `quality` (~30s)
writes a richer prompt but is too slow to feed a broadcast.

**STORY DIRECTOR** is optional. Without an Anthropic key the request goes to H3 Max
with a continuity line attached and the model expands it itself. With one, Claude
writes each shot against the story so far — better continuity, one extra second per
shot. It runs on `claude-opus-5` at low effort with server-side refusal fallback, so
a declined request drops back to the plain composer instead of stalling the channel.

## What it costs

Every shot is a paid fal render, and a channel eats one every few seconds. The guards:

- **SHOT CAP** (default 25) hard-stops generation for the session; the channel then
  holds on the last shot rather than spending.
- **BUFFER AHEAD** (default 2) bounds how far ahead it renders.
- Nothing renders before you tune in.

The meter bar shows shots rendered and total seconds of video generated, so the spend
is visible while it happens.

## When things go wrong

- **Buffer runs dry** — the channel holds on the last shot, chyroned `HOLDING`, rather
  than cutting to black. Shorten the shots or drop to 480P.
- **Closing frame unreadable** — if the video host blocks canvas reads, chaining falls
  back to continuing by description. The channel says so once and keeps running.
- **fal rejects a request** — the error fal returned is printed in the chat log, and
  auth or balance failures put it on the standby slate instead of failing silently.
