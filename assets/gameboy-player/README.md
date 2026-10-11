# Rambo Arcade Game Boy Player

This separate player application (gameboy-player.html, player.js, player.css) is licensed under GPL-3.0-or-later, together with its WasmBoy dependency. This does not change the licensing of the other arcade games. See LICENSE.txt.

WasmBoy 0.7.1 is by Aaron Turner and contributors. The runtime bundle is the npm-published `dist/wasmboy.wasm.esm.js`, renamed to `wasmboy.js`, with the save-restore fix described below. Corresponding patched source and upstream build configuration are provided in `wasmboy-source.zip`; upstream commit: `8e96bcb70969d943b1ffc4028b169c835098ce04`. Original source: https://github.com/torch2424/wasmboy. The runtime bundle includes its workers and WebAssembly core, so no CDN is needed. No game ROMs or proprietary boot ROMs are distributed.

Rambo patch (11 October 2026): all four audio-channel `loadState()` methods used the current `cycleCounter` as the save-state slot index, instead of each channel's fixed `saveStateSlot`. Repeated restores could read the wrong sound state or trap with an out-of-bounds memory access. The four reads now use slots 7, 8, 9, and 10. Source changes are included in the source archive. The bundled WASM was patched with equivalent constant operands, preserving byte offsets; the rest of the runtime is unchanged. The original core SHA-256 is `f2d6a734ce5c3e752c98173b194128fd72f688d0cff226a3e5f61d9930de83a8`, and the patched core is `9ee29603197046dfe12db62c37fa966b0276c898cba25cc2e691b1265080ab7b`.

The player supports raw .gb and .gbc cartridges up to 4 MB, using ROM, MBC1, MBC2, MBC3, and MBC5 cartridge types. Game Boy Advance, ZIP files, and special cartridges such as the Game Boy Camera are unsupported. ROM compatibility varies by game.

Game files are read in the browser and never uploaded or stored in the repository. Rambo's IndexedDB store, `rambo-pocket-saves`, uses the SHA-256 digest of the entire ROM to distinguish saves. There is one autosave and one independent quick save per game. Autosave runs every 20 seconds while playing and when pausing, switching games, or hiding the page. Load the same ROM to resume the most recent state. Game files must be reselected after refreshing. Clearing browser data removes saves; export a backup first. Private browsing may make saves temporary or unavailable.

Export/import uses a versioned Rambo JSON snapshot (.rambo-save), containing no ROM. Imports validate the ROM hash, emulator version, and exact memory dimensions. These snapshots aren't interchangeable with another emulator's .sav battery files.

Keyboard: arrows/WASD = move, X = A, Z = B, Enter = Start, Shift = Select, P = pause. Touch controls support simultaneous pointers, diagonals, sliding on the D-pad, and release on cancellation/focus loss. Fullscreen is optional and subject to browser support.
