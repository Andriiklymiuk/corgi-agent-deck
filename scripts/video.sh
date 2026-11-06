#!/bin/sh
# docs/media/store/demo.mp4 from scripts/video.ts. Needs Chrome and ffmpeg.
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cd "$(dirname "$0")/.."
# Chrome can exit non-zero after writing the picture: the picture is the proof.
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT
shot() { # <width,height> <out.png> <in.html>
  rm -f "$2"
  "$CHROME" --headless=new --hide-scrollbars --disable-gpu --no-first-run --user-data-dir="$PROFILE" --window-size="$1" --screenshot="$PWD/$2" "file://$PWD/$3" >/dev/null 2>&1 || true
  [ -s "$2" ] || { echo "no picture: $2" >&2; exit 1; }
}
npx -y tsx scripts/video.ts
for html in docs/media/video/*.html; do
  shot 1920,1080 "${html%.html}.png" "$html"
done
ffmpeg -y -loglevel error -f concat -safe 0 -i docs/media/video/list.txt -vf "fps=30,format=yuv420p" -c:v libx264 -crf 18 -movflags +faststart docs/media/store/demo.mp4
rm -rf docs/media/video
echo "docs/media/store/demo.mp4"
