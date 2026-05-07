#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_FILE="${1:-$ROOT_DIR/data/cycle-routes.osm.json}"
BBOX="${2:-46.08,-1.75,46.33,-1.15}"

QUERY='[out:json][timeout:25];(relation["type"="route"]["route"="bicycle"]('
QUERY+="$BBOX"
QUERY+='););way(r);out geom;'

mkdir -p "$(dirname "$OUTPUT_FILE")"

curl -fsSL --data-urlencode "data=${QUERY}" https://overpass-api.de/api/interpreter -o "$OUTPUT_FILE"

BYTES=$(wc -c < "$OUTPUT_FILE" | tr -d ' ')
echo "Fichier genere: $OUTPUT_FILE ($BYTES octets)"
