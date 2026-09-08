#!/bin/sh
# Screenshots docs/media/showcase-*.html with Chrome and animates the pulse.
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cd "$(dirname "$0")/.."
mkdir -p docs/media/frames
for v in mk2 mini; do
  "$CHROME" --headless=new --hide-scrollbars --disable-gpu --window-size=1920,1080 --screenshot="$PWD/docs/media/deck-$v.png" "file://$PWD/docs/media/showcase-$v.html" >/dev/null 2>&1
done
for i in 0 1 2 3 4 5 6 7; do
  "$CHROME" --headless=new --hide-scrollbars --disable-gpu --window-size=1920,1080 --screenshot="$PWD/docs/media/frames/mini-$i.png" "file://$PWD/docs/media/frames/mini-$i.html" >/dev/null 2>&1
done
magick -delay 55 -loop 0 docs/media/frames/mini-*.png -resize 960x540 -layers Optimize docs/media/deck-pulse.gif
rm -rf docs/media/frames
echo "docs/media: deck-mk2.png deck-mini.png deck-pulse.gif"
