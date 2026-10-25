#!/bin/sh
# Lo ejecuta el LaunchAgent cada 30 min y al iniciar sesión (ver scripts/launchd/).
# launchd no carga el PATH del usuario: aquí se fija el de node (el mismo que usa Finanzas).
export PATH="$HOME/.local/node-v24.18.0-darwin-arm64/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.." || exit 1
exec node scripts/sync-obsidian.mjs
