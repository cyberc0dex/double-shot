# 🏸 Double Shot 🏸

> the badminton doubles tracker your club lowkey didn't deserve 💅✨

Okay Unc, listen up 🗣️🗣️ You've been scribbling scores on a napkin 🧻 and picking teams like it's 1987 📼👴 Respectfully? That era is OVER 💀💀💀

Double Shot picks fair teams, keeps score live at the court, tracks who's actually carrying 🏆, and spits out a session report so clean you'll wanna frame it 🖼️🔥

**👉 Tap in:** [cyberc0dex.github.io/double-shot](https://cyberc0dex.github.io/double-shot/)

No account 🙅. No server 🚫☁️. No ads 🤮. Your data stays in YOUR browser, bestie 🔒
Install it on your phone and it works offline too. Yes Unc, even at that sports hall with zero bars 📵😭

---

## ✨ What it does ✨

- 🎲 **Fair team draws, no cap.** Whoever sat out longest gets picked first. Same partners again? Hella unlikely. Lopsided teams? We don't do that here 🙅‍♀️ But nothing is ever *impossible*, because chaos keeps it spicy 🌶️
- 📱 **Live scoring.** Big fat tap buttons 👆 so even your thumbs can't miss, Unc. Undo button for when you fumble 🤡, a serve indicator, a match timer ⏱️, and it knows real badminton rules (21 points, win by 2, capped at 30) Periodttt 💯
- 📊 **Standings.** Wins, losses, games played, win rate. Worked out fresh from the match history every time, so the totals literally cannot drift. It's math, Unc, it doesn't lie 📈
- 📜 **Match history.** Typo'd a score? Edit it. Match never happened? Delete it. We don't judge 🤓
- 🏅 **Session highlights.** Top Player 👑, Deadly Duo 🔥, Quickest Match ⚡ and Longest Match ⏳. They unlock after 4 matches, so no, you can't claim MVP after one game 😤
- 🖼️ **Session report.** A drop-dead gorgeous image of the whole session. Send it to the group chat and watch everyone cope 😮‍💨📲
- 📴 **Offline + installable.** Add it to your home screen and it acts like a real app. That's how a "PWA" works, you're welcome unc 🙏

---

## 🚀 Running it yourself (for the brave)

It's just plain JavaScript modules and CSS. No build step, no framework drama 🎭🚫
BUT it has to be served over HTTP. Double-clicking `index.html` will NOT work son. We've been
over this 😩🙄

```bash
git clone https://github.com/cyberc0dex/double-shot.git
cd double-shot
npx serve .          # or: python -m http.server
```

Open whatever address it prints and boom, you're in 💥

---

## 🎛️ Knobs you're allowed to touch

Everything tweakable lives in [`config.js`](config.js). Touch nothing else. I'm serious 🫵

| Setting | What it does |
|---|---|
| `APP_ENV` | `'production'` = offline mode ON 📴✅. `'development'` = kills the service worker, clears its cache and slaps a `DEV` badge on the header, so a refresh always loads your fresh edits 🔄 |
| `APP_VERSION` | Bump it EVERY release 🔢 or phones keep serving the old version and you'll be crying in the group chat 😭 |
| `RULES` | Target score, win-by margin and point cap 🏸 |
| `MATCHMAKING` | How the team draw decides things. Mess this up and it's on you 💀 |

---

## 🧠 How teams get drawn (big brain time)

The logic lives in [`js/matchmaking.js`](js/matchmaking.js). Two steps, both with a lil randomness 🎰

1. **Who plays 🙋** Four players are pulled from whoever's marked available. Played less? You get priority. Just played the last match or the one before? Sit down, hydrate 💧🪑
2. **Who partners who 👯** Four players can only be split into teams 3 ways. Each split gets a penalty for repeat partners, repeat opponents and uneven teams. The lowest penalty usually wins, but a small dash of pure luck keeps every split possible. Plot twists are healthy 🍿

---

## 🗂️ What's in the box

```
index.html           the whole page, icons baked right in 🍞
manifest.json        the PWA passport 🛂
service-worker.js    the offline wizard 🧙
config.js            the knobs 🎛️
css/app.css          the drip 💧👗
js/app.js            the boss, runs the show 🎬
js/state.js          the memory, saves everything 🧠
js/matchmaking.js    the team picker 🎲
js/highlights.js     the hype machine 📣
js/render.js         puts stuff on screen 🖥️
js/share.js          makes the session report 🖼️
js/ui.js             popups, toasts and menus 🍞🍞
```

---

## 🙌 Credits

* Icons by [Phosphor Icons](https://phosphoricons.com) (MIT).
* Coded by Claude Opus 5.5 🐐 what a G

---

<p align="center">This app is hella vibe coded 😩 so blame Claude frfr<br>now go touch some grass, Unc 🌱✌️</p>
