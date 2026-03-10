#!/bin/bash
# Asset-konvertering: FBX → GLB med Draco-komprimering
# Krever: npx gltf-pipeline, FBX2glTF (eller npx fbx2gltf)

set -e

ANIM_SRC="$HOME/Desktop/Video og 3D/animasjon"
ANIM_DEST="client/public/models/animations"
CHAR_DEST="client/public/models/characters"

echo "=== DRITTFOLK Asset Pipeline ==="

# Sjekk om npx er tilgjengelig
if ! command -v npx &> /dev/null; then
  echo "FEIL: npx ikke funnet. Installer Node.js."
  exit 1
fi

# Konverter Mixamo-animasjoner
echo ""
echo "--- Konverterer Mixamo-animasjoner ---"
mkdir -p "$ANIM_DEST"

for fbx in "$ANIM_SRC"/*.fbx; do
  [ -f "$fbx" ] || continue
  basename=$(basename "$fbx" .fbx)
  # Erstatt mellomrom med underscore, fjern parenteser
  clean_name=$(echo "$basename" | sed 's/ /_/g; s/[()]//g; s/__/_/g')
  output="$ANIM_DEST/${clean_name}.glb"

  if [ -f "$output" ]; then
    echo "  Allerede konvertert: $clean_name"
    continue
  fi

  echo "  Konverterer: $basename → $clean_name.glb"
  npx fbx2gltf -i "$fbx" -o "$output" --draco 2>/dev/null || {
    echo "  ADVARSEL: Kunne ikke konvertere $basename (prøv FBX2glTF manuelt)"
  }
done

echo ""
echo "--- Synty-modeller ---"
echo "NB: Synty-modeller fra Polygon Office Pack må konverteres manuelt."
echo "1. Finn FBX-filer i Unreal-prosjektet eller kjøp/last ned FBX-versjonen"
echo "2. Konverter med: npx fbx2gltf -i modell.fbx -o $CHAR_DEST/modell.glb --draco"
echo ""

echo "Ferdig! Sjekk $ANIM_DEST og $CHAR_DEST"
