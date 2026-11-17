#!/usr/bin/env bash
# Lance le site d'entraînement EOPN en local (port 8000 par défaut, ou le suivant libre).
cd "$(dirname "$0")"
PORT="${1:-8000}"
port_busy() { python3 -c "import socket,sys; s=socket.socket(); sys.exit(0 if s.connect_ex(('127.0.0.1', $1)) == 0 else 1)"; }
while port_busy "$PORT"; do
  echo "Port $PORT déjà utilisé, essai du port $((PORT + 1))…"
  PORT=$((PORT + 1))
done
echo "Entraînement EOPN : http://localhost:${PORT}  (auto-tests : http://localhost:${PORT}/tests.html)"
echo "Ctrl+C pour arrêter."
exec python3 -m http.server "$PORT" --bind 127.0.0.1
