#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RES="${ROOT}/mobile/android/app/src/main/res"
ICON="${ROOT}/icon-512.png"

if [[ ! -s "${ICON}" ]]; then
  echo "::error::ARVEX icon-512.png is missing or empty"
  exit 1
fi
if [[ ! -d "${ROOT}/mobile/android/app/src/main" ]]; then
  echo "::error::Capacitor Android project has not been generated"
  exit 1
fi

# Capacitor's generated Android template may contain placeholder launcher icons.
# Use the checked-in ARVEX artwork for every legacy density and adaptive launcher icon.
for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  target="${RES}/mipmap-${density}"
  mkdir -p "${target}"
  cp "${ICON}" "${target}/ic_launcher.png"
  cp "${ICON}" "${target}/ic_launcher_round.png"
  cp "${ICON}" "${target}/ic_launcher_foreground.png"
done

mkdir -p "${RES}/mipmap-anydpi-v26" "${RES}/values"
cat > "${RES}/mipmap-anydpi-v26/ic_launcher.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
XML
cat > "${RES}/mipmap-anydpi-v26/ic_launcher_round.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
XML
cat > "${RES}/values/ic_launcher_background.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#07080d</color>
</resources>
XML

echo "ARVEX Android launcher icons installed from icon-512.png"
