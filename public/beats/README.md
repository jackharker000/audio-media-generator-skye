# Backing beats (optional)

The free `google-tts-beat` music provider speaks/raps the lyrics over a backing
loop, if one is available here. Drop **royalty-free, commercially-licensed** MP3
loops in this folder:

- `default.mp3` — used when no genre-specific beat is found.
- `<genre>.mp3` — e.g. `pop.mp3`, `hip-hop.mp3`, `lo-fi.mp3` (genre is lowercased and
  non-alphanumeric characters become `-`).

If no beat is present, the TTS path returns spoken lyrics with no backing track.

⚠️ Only add audio you have the rights to use. Keep a record of each file's license.
