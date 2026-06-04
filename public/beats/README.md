# Backing beats / loops (optional)

The music engines can layer the vocal over a **royalty-free** backing loop, if one
is present here. Drop **commercially-licensed** loops in this folder:

- `default.wav` — used when no genre-specific loop is found.
- `<genre>.wav` — e.g. `pop.wav`, `hip-hop.wav`, `lo-fi.wav` (genre is lowercased
  and non-alphanumeric characters become `-`).

Format by engine:
- **`gemini-song`** (default) mixes loops in **pure JS**, so use **WAV** (16-bit).
- **`google-tts-beat`** mixes via ffmpeg, so it uses **MP3** (`<genre>.mp3`).

`gemini-song` already synthesizes chords/bass/drums on its own, so loops are purely
optional extra flavor. If none are present, you still get the synth backing.

⚠️ Only add audio you have the rights to use. Keep a record of each file's license.
