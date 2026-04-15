#!/usr/bin/env bash
# Installs bundled XFCE / WhiteSur desktop assets into the image (same as Cursor dev VM).
set -euo pipefail

BUNDLE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -d -m 0755 /usr/share/themes
HAS_WHITESUR_THEME=0
if [ -d "${BUNDLE}/usr-share/themes/WhiteSur-Light" ]; then
    cp -a "${BUNDLE}/usr-share/themes/WhiteSur-Light" /usr/share/themes/
    HAS_WHITESUR_THEME=1
fi

install -d -m 0755 /usr/share/icons
cp -a "${BUNDLE}/usr-share/icons/WhiteSur" \
    "${BUNDLE}/usr-share/icons/WhiteSur-cursors" \
    "${BUNDLE}/usr-share/icons/WhiteSur-dark" \
    "${BUNDLE}/usr-share/icons/WhiteSur-light" \
    /usr/share/icons/

install -d -m 0755 /usr/share/fonts/truetype
cp -a "${BUNDLE}/usr-share/fonts/truetype/macos" /usr/share/fonts/truetype/

install -d -m 0755 /usr/share/backgrounds
cp -a "${BUNDLE}/usr-share/backgrounds/desktop-background-1.png" \
    "${BUNDLE}/usr-share/backgrounds/desktop-background-2.png" \
    "${BUNDLE}/usr-share/backgrounds/desktop-background-3.png" \
    "${BUNDLE}/usr-share/backgrounds/macos-wallpaper.png" \
    /usr/share/backgrounds/

install -d -m 0755 /usr/share/backgrounds/xfce
cp -a "${BUNDLE}/usr-share/backgrounds/xfce/xfce-shapes.svg" /usr/share/backgrounds/xfce/

install -d -m 0755 /usr/share/icons/hicolor/24x24/apps
shopt -s nullglob
for f in "${BUNDLE}/usr-share/icons/hicolor/24x24/apps/"cursor-logo*; do
    cp -a "$f" /usr/share/icons/hicolor/24x24/apps/
done
shopt -u nullglob

fc-cache -f /usr/share/fonts/truetype/macos
gtk-update-icon-cache -f /usr/share/icons/hicolor 2>/dev/null || true

HAQI_HOME="${HAQI_CONTAINER_HOME:-/home/haqi}"
install -d -m 0755 -o haqi -g haqi "${HAQI_HOME}/.config/gtk-3.0"
install -d -m 0755 -o haqi -g haqi "${HAQI_HOME}/.config/xfce4/xfconf/xfce-perchannel-xml"

cp -a "${BUNDLE}/skel/.config/gtk-3.0/"* "${HAQI_HOME}/.config/gtk-3.0/"
cp -a "${BUNDLE}/skel/.config/xfce4/xfconf/xfce-perchannel-xml/"* \
    "${HAQI_HOME}/.config/xfce4/xfconf/xfce-perchannel-xml/"

if [ "$HAS_WHITESUR_THEME" -ne 1 ]; then
    sed -i 's/WhiteSur-Light/Adwaita/g' "${HAQI_HOME}/.config/gtk-3.0/settings.ini"
    sed -i 's/WhiteSur-Light/Adwaita/g' "${HAQI_HOME}/.config/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml"
    sed -i 's/WhiteSur-Light/Default/g' "${HAQI_HOME}/.config/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml"
fi

chown -R haqi:haqi "${HAQI_HOME}/.config"
