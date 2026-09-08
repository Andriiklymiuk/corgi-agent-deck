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
for v in mk2 mini talk states; do
  "$CHROME" --headless=new --hide-scrollbars --disable-gpu --window-size=1920,960 --screenshot="$PWD/docs/media/store/$v.png" "file://$PWD/docs/media/store/$v.html" >/dev/null 2>&1
done
magick com.andriiklymiuk.corgi-agent-deck.sdPlugin/imgs/plugin/marketplace@2x.png -resize 288x288 docs/media/store/icon-288.png
if command -v ffmpeg >/dev/null; then
  ffmpeg -y -loglevel error -framerate 2 -i docs/media/frames/mini-%d.png -vf "scale=1920:1080,format=yuv420p" -t 8 docs/media/store/pulse.mp4
fi
rm -rf docs/media/frames
echo "docs/media: deck-mk2.png deck-mini.png deck-pulse.gif; store/: icon-288.png thumbnail+gallery *.png (1920×960), pulse.mp4"
