# Sunspoke Park

An interactive isometric theme park simulation game built as a self-contained browser app.

## Run

The local server runs on:

```text
http://127.0.0.1:4173
```

If you need to restart it:

```powershell
& 'C:\Users\jhale\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.mjs
```

## Controls

- Click a tool, then click the park to place it.
- Right-click a tile to remove paths, water, rides, or scenery.
- Drag the park to pan.
- Use the mouse wheel to zoom.
- Use WASD or arrow keys to move the camera.
- Use the speed buttons to pause or run the simulation faster.

## Simulation

Guests enter through the gate path, choose connected rides and shops, queue, spend money, and react to cleanliness and waiting time. Attractions increase appeal and growth, bins and cleaners improve cleanliness, and litter slowly appears as the park gets busier.

## Generated Art Assets

The imagegen-produced art direction and game asset sheets are saved in `assets/`:

- `visual-direction.png`
- `rides-buildings-sheet.png`
- `terrain-scenery-sheet.png`
- `ui-icons-sheet.png`
