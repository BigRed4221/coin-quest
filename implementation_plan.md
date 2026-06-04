# Coin Quest - Implementation Plan

Coin Quest is a 2D side-scrolling platformer brawler with active combat and custom skills. The game is built using **Vanilla JS/TS, HTML5 Canvas, and Vite**. The player controls **Carl Quest**, a mid-30s guy who has been evicted from his grandma's house due to a massive, hyper-inflated library book late fee debt. He ventures out to collect coins, punch monkeys, and defeat government repo/IRS agents to buy back his house.

This plan details the design and roadmap for the initial tutorial area: **The Suburbs**.

## Design Decisions & Control Scheme

- **Controls**:
  - **Move Left/Right**: `A` / `D`
  - **Jump**: `W`
  - **Crouch/Duck**: `S` (used to duck under diving pigeons)
  - **Attack / Interact**: Left Mouse Click or `J` key. Pressing consecutively triggers the **Punch-Punch-Kick Combo**.
  - **Active Skills**: `E` (Skill Slot 1) and `F` (Skill Slot 2).
  - **Rest at Campfire**: `R` key (when near a campfire).
- **Stun & Flash Effects**:
  - Enemies turn completely white for a brief split-second (retro flash effect) and receive a brief stun upon taking damage.
- **Campfire Menu UI**:
  - Built as a modern, glassmorphic HTML/CSS overlay on top of the Canvas. It pauses the game and lets the player manage active skills.

---

## Suburbs (Tutorial Area) Gameplay Details

### 1. Level Design & Flow
- **Porch Start**: Carl starts on his Grandma's porch with an eviction notice.
- **Tutorial Blocks**:
  1. Obstacles (Trash cans, picket fences) requiring jump (`W`).
  2. Blocked path (Cardboard box stack) requiring punch combo (`J`).
  3. Diver pigeons requiring crouch (`S`).
  4. Rogue lawnmowers requiring jumping over, waiting for them to crash, and then hitting them.
- **Midpoint Checkpoint**: A Campfire (`R` to interact) that saves progress and opens the Skill overlay.
- **Boss Fight**: **Officer Bob** at the exit gate. Defeating Bob unlocks the **Coin Slide** skill and opens the gate to the Jungle.

### 2. Suburbs Enemies
- **Angry Pigeons**: Fly overhead and dive at Carl. Can be dodged by crouching (`S`). Die in 1-2 hits.
- **Stray Dogs**: Fast charging hazard. Require a full Punch-Punch-Kick combo to defeat.
- **Runaway Lawnmowers**: Patrol back and forth. Immune to frontal attacks until they crash into an obstacle, disabling them momentarily for a strike.

### 3. Suburbs Boss: Officer Bob (Segway Police)
- Rides a souped-up Segway.
- **Attacks**:
  1. *Citation Throw*: Throws projectile paper tickets that deal damage.
  2. *Segway Charge*: Dashes across the screen. Player must jump over him.
- **Strategy**: Jump over his charges, wait for him to recover, and hit him from behind.

---

## Technical Architecture

The codebase will be written in TypeScript/JavaScript:
- `index.html`: Layout container, HUD (Health, Money Meter, Coin counter), Campfire Overlay UI, and Tutorial dialog boxes.
- `src/style.css`: Design system and glassmorphic UI.
- `src/main.ts`: Configures inputs and bootstraps the game loop.
- `src/engine/GameEngine.ts`: Game loop, AABB physics, state coordinator.
- `src/engine/Level.ts`: Level geometry, enemy spawn points, and campfire position.
- `src/entities/Player.ts`: Carl's state machine, physics, and combo combat tracking.
- `src/entities/Enemy.ts`: AI scripts for dogs, pigeons, lawnmowers, and Officer Bob.
- `src/entities/Drop.ts`: Physics-based bouncing coins and XP gems.
