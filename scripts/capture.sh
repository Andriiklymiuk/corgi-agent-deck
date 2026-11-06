#!/bin/sh
# Screenshots docs/media/showcase-*.html with Chrome and animates the pulse.
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
mkdir -p docs/media/frames
for v in mk2 mini; do
  shot 1920,1080 "docs/media/deck-$v.png" "docs/media/showcase-$v.html"
done
for i in 0 1 2 3 4 5 6 7; do
  shot 1920,1080 "docs/media/frames/mini-$i.png" "docs/media/frames/mini-$i.html"
done
magick -delay 55 -loop 0 docs/media/frames/mini-*.png -resize 960x540 -layers Optimize docs/media/deck-pulse.gif
for v in mk2 mini talk states; do
  shot 1920,960 "docs/media/store/$v.png" "docs/media/store/$v.html"
done
magick com.andriiklymiuk.corgi-agent-deck.sdPlugin/imgs/plugin/marketplace@2x.png -resize 288x288 docs/media/store/icon-288.png
if command -v ffmpeg >/dev/null; then
  ffmpeg -y -loglevel error -framerate 2 -i docs/media/frames/mini-%d.png -vf "scale=1920:1080,format=yuv420p" -t 8 docs/media/store/pulse.mp4
fi
rm -rf docs/media/frames
echo "docs/media: deck-mk2.png deck-mini.png deck-pulse.gif; store/: icon-288.png thumbnail+gallery *.png (1920×960), pulse.mp4"
