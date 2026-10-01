# Voxel Survival Core — GitHub Pages Edition

A browser-playable Minecraft-inspired voxel survival prototype.

## Publish on GitHub Pages

1. Create or open a GitHub repository.
2. Upload **all files in this folder** to the repository root.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select your branch (usually `main`) and folder **`/ (root)`**, then save.
6. Open the GitHub Pages URL GitHub gives you.

No build step is required. `index.html` is the entry point and Three.js is loaded from jsDelivr, so the game works as a normal static GitHub Pages site.

## Controls

- **WASD** — move
- **Mouse** — look
- **Space** — jump
- **Shift** — sprint
- **Hold left mouse** — mine
- **Right mouse** — place selected block
- **1–9** — select hotbar slot

## Core systems

- Procedural rolling plains terrain
- Grass, dirt, stone, logs and leaves
- Natural tree generation
- Water in low areas
- First-person camera and pointer lock
- Gravity, jumping and voxel collision
- Hold-to-mine with different block hardness
- 9-slot inventory/hotbar
- Block collection and grid-snapped placement
- Lighting, fog and shadows

This build deliberately focuses on the core gameplay loop rather than mobs, crafting, combat, caves, weather or a day/night system.
