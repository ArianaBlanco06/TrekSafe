#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
python3 ./preflight.py "${1:?Usar api o worker}"
docker compose --project-name "treksafe-$1" --env-file /etc/treksafe/deployment.env -f "compose.$1.yml" config --quiet
