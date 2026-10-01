# Voxel Survival Online — GitHub Pages

This version is designed to be uploaded directly to GitHub Pages.

## What changed

- Chunked greedy-style face culling: only visible voxel faces are sent to the GPU.
- One mesh per chunk for opaque terrain and one for water, which is dramatically lighter than thousands of individual cube meshes.
- Pixel-art textures made as real 64×64 source textures and packed into a 256×256 atlas.
- Crafting UI with planks, sticks, wooden pickaxe and stone pickaxe.
- Passive cows and hostile zombies with simple AI.
- Peer-to-peer multiplayer using PeerJS/WebRTC, so **GitHub Pages can host the game itself**. No separate game server is required.

## GitHub Pages

Upload the contents of this folder to the root of a GitHub repository:

```text
.nojekyll
index.html
main.js
style.css
textures/
README.md
```

Then enable:

`Settings → Pages → Deploy from a branch → main → /(root)`

Your game URL will be:

`https://YOUR-USERNAME.github.io/YOUR-REPO/`

## Multiplayer

One player clicks **Host World** and then **Enter World**.

The host gets:
- a room code
- a copyable invite link

Send the invite link to your mates. They can open it, enter a name, and click **Enter World**.

The world is deterministic on every browser. Block edits are synchronized through the host, and remote players are shown in the world.

### Important
Peer-to-peer networking works in modern browsers, but school/work networks can sometimes block WebRTC. GitHub Pages itself only serves the static files; the peer connection is handled by PeerJS.

## Controls

- WASD — move
- Mouse — look
- Space — jump
- Shift — sprint
- Hold left mouse — mine
- Right mouse — place
- 1–9 — hotbar
- C — crafting

## Crafting

- 1 Log → 4 Planks
- 2 Planks → 4 Sticks
- 3 Planks + 2 Sticks → Wooden Pickaxe
- 3 Stone + 2 Sticks → Stone Pickaxe

Pickaxes speed up stone mining.

## Performance design

The terrain uses:
- deterministic multi-scale noise
- chunk meshes
- hidden-face culling
- a texture atlas
- capped device pixel ratio
- no individual mesh per block

That makes this foundation much more scalable than the original cube-per-block renderer.
