# Canastón — Setup Guide for Non-Developers

This guide gets the app running on your phone or simulator in about 10 minutes.
No prior coding experience needed.

---

## What you'll need

| Tool | Why | Download |
|------|-----|----------|
| **Node.js** (v20+) | Runs the project | https://nodejs.org → click "LTS" |
| **Expo Go** app | Preview on your phone | App Store or Google Play |
| A terminal / command prompt | Type commands | Built into macOS/Windows |

> **macOS**: open **Terminal** (search with Spotlight ⌘+Space → "Terminal")  
> **Windows**: open **Command Prompt** or **PowerShell**

---

## Step 1 — Install Node.js

1. Go to https://nodejs.org
2. Click the big green **"LTS"** button and download the installer.
3. Run the installer and click Next through all steps.
4. When it finishes, open a terminal and confirm it worked:
   ```
   node --version
   ```
   You should see something like `v20.11.0`.

---

## Step 2 — Install the project dependencies

In your terminal, navigate to this project folder.  
If the project is on your Desktop in a folder called `canaston`, type:

```
cd ~/Desktop/canaston
```

Then install all the libraries the app needs:

```
npm install
```

This downloads everything automatically. It may take 1–2 minutes. You'll see a lot of text scroll by — that's normal.

---

## Step 3 — Start the app

```
npm start
```

A QR code will appear in the terminal, along with a web page at http://localhost:8081.

---

## Step 4 — Open on your phone

1. Make sure your phone and computer are on the **same Wi-Fi network**.
2. Open **Expo Go** on your phone.
3. Tap **"Scan QR code"** and point it at the QR code in your terminal.
4. The app will load on your phone in a few seconds. 🎉

---

## Step 5 — Open on a simulator (optional)

If you have Xcode (Mac) or Android Studio installed:

- Press **`i`** in the terminal to open an iOS simulator.
- Press **`a`** in the terminal to open an Android emulator.

---

## Running the tests

To check that the game logic works correctly:

```
npm test
```

You should see a list of tests, all passing (green checkmarks).

---

## Common problems

| Problem | Fix |
|---------|-----|
| `npm: command not found` | Node.js wasn't installed correctly. Re-run the installer. |
| QR code doesn't work | Make sure phone and computer are on the same Wi-Fi. |
| App shows a red error screen | Press `r` in the terminal to reload. |
| `npm install` fails | Try deleting the `node_modules` folder and running `npm install` again. |

---

## Project structure (for the curious)

```
canaston/
├── app/                   ← Screens (what you see)
│   ├── index.tsx          ← Lobby (home screen)
│   ├── game.tsx           ← Main game board
│   └── results.tsx        ← Round results
│
├── src/
│   ├── engine/            ← Pure game logic (no UI here)
│   │   ├── types.ts       ← All game data types
│   │   ├── deck.ts        ← Card deck & shuffle
│   │   ├── rules.ts       ← Game rule validation
│   │   ├── scoring.ts     ← Points calculation
│   │   └── stateMachine.ts← Game phase transitions
│   │
│   ├── components/        ← Reusable visual pieces
│   │   ├── CardView.tsx   ← A single playing card
│   │   ├── HandView.tsx   ← A player's hand
│   │   └── CanastaView.tsx← A completed canasta
│   │
│   └── store/
│       └── gameStore.ts   ← Connects engine to UI
│
└── tests/                 ← Automated tests
    └── engine/
        ├── deck.test.ts
        ├── rules.test.ts
        └── scoring.test.ts
```

---

## Game rules

The full rules are in **readme.md** (Spanish). This app implements them exactly.

Key concepts:
- **4 players**, 2 teams of 2 (Norte-Sur vs Este-Oeste)
- **162 cards**: 3 standard decks + 6 jokers
- **Goal**: reach **15,000 points** across multiple rounds
- **Canasta**: 7 cards of the same rank; *clean* (no wildcards) scores more than *dirty*
- **Monos** (wildcards): 2s and Jokers — can fill in combinations
- **Honors** (red 3s): placed on table for bonus/penalty points at round end

---

*Built with Expo + React Native + TypeScript*
