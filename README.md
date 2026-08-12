# DartDeck

Local LAN darts scoring system designed for smart TVs, tablets, and phones. Perfect for game rooms, bars, or local setups.

---

## How It Works

DartDeck uses a **Dual-Screen Architecture** over your local network:
1. **The Host Display (TV/Monitor/PC)**: Runs the visual scoreboard. It displays active players, checkout combinations (standard and simple suggestions), averages, throw counters, turn trackers, and active animations.
2. **The Mobile Controllers (Smartphones/Tablets)**: Handheld keypads used by players to log throws. No app installation required—simply connect to the local IP address on any web browser.

---

## Features

### Gameplay & Scoring
* **Classic x01 Rules**: Supported formats include 301, 501, 701, or custom start scores.
* **Flexible Checkout Rules**: Choose between Double-Out, Master-Out, or Straight-Out options.
* **Checkout Helper**: Auto-calculates standard 3-dart checkout patterns (up to 170) as well as quick alternative routes (e.g., `2x 20` for 40 left).
* **Score History & Undo**: Made a mistake? Seamlessly tap the `UNDO` button to roll back previous turns.

### Player & Profile Management
* **Profile Persistence**: Create profiles locally that save player data such as games played, wins, lifetime average, and personal highest checkout.
* **Custom Swatch Color & Name Editing**: Edit existing profiles at any time to update your target screen colors or names.
* **Profile Deletion**: Easily remove outdated or temporary profiles directly from the controller lobby.
* **First-Time Device Memory**: Automatically remembers which player profile is associated with each handheld phone.

### Bot
* **Throw-by-Throw Simulation**: Simulates an active player throwing darts one by one in real time on the Host scoreboard rather than instantly applying scores.
* **Variable Difficulties**: Test your skills against Easy, Medium, or Hard configurations with tailored hit rates and smart checkout logic.

### Display & Responsive Layout
* **Dynamic scaling**: Displays scale dynamically on host screens depending on player count (1 to 4 players). Layout margins, scoreboard numbers, and text paddings adjust automatically to guarantee no clipping or scrolling is required.
* **Immersive Effects**: Interactive Audio engine (synthesized tones for hits, misses, and high targets), structural screen shaking for targets over 100, and confetti celebrations.
* **Automated Kiosk Mode & Idle Safety**: Auto-ends games after 5 minutes of inactivity to protect TV displays from burn-in.

---

## Setup Instructions

### Windows Installation (Local PC)
1. **Prerequisites**: Download and install [Node.js](https://nodejs.org/) (version 18 or higher is recommended).
2. **Install dependencies**:
   Open a command prompt inside the `dartdeck` directory and run:
   ```cmd
   npm install
   ```
3. **Launch**:
   Double-click the `start.bat` file in the root directory. It will launch the backend process on port `3000`.
4. **Accessing the Scoreboard**:
   * **On the Host PC/TV**: Open a browser and navigate to `http://localhost:3000`.
   * **On Player Phones**: Ensure your phone is connected to the same Wi-Fi network. Open a web browser and enter the **Network URL** shown on the TV display (e.g., `http://192.168.1.15:3000`).

---

## Developer Operations

### Linux & Raspberry Pi Deployment
* Run manually: `./start.sh`
* For automated service installation, run:
  ```bash
  sudo ./scripts/install-autostart.sh
  ```
  This registers, restarts, and runs DartDeck via `systemd` in the background automatically upon boot.

## Note

### AI Disclosure

This project was made using AI Tools, but has been tested by me on a Linux Mint XFCE and Windows 11 system.
