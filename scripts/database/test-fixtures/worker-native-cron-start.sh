set -euo pipefail
entrypoint=$(command -v docker-entrypoint.sh)
config=/etc/postgresql/postgresql.conf
library=$(pg_config --pkglibdir)/pg_cron.so
control=$(pg_config --sharedir)/extension/pg_cron.control
version=$(pg_config --version)
[[ "$version" == 'PostgreSQL 17.11' ]] || exit 91
[[ -f "$entrypoint" && -f "$config" && -f "$library" && -f "$control" ]] || exit 92
if command -v gosu >/dev/null; then
 preload=$(gosu postgres postgres -D /etc/postgresql -C shared_preload_libraries)
elif command -v runuser >/dev/null; then
 preload=$(runuser -u postgres -- postgres -D /etc/postgresql -C shared_preload_libraries)
else
 exit 93
fi
[[ "$preload" =~ ^[a-zA-Z0-9_,\ ]+$ ]] || exit 94
default_version=$(sed -n "s/^[[:space:]]*default_version[[:space:]]*=[[:space:]]*'\([^']*\)'.*/\1/p" "$control")
[[ "$default_version" == '1.6.4' ]] || exit 95
sha() { sha256sum "$1" | cut -d' ' -f1; }
init_hash=$(find /docker-entrypoint-initdb.d -type f -print0 | sort -z | xargs -0 -r sha256sum | sha256sum | cut -d' ' -f1)
printf 'CUEVO_CRON_STARTUP_V1\t17.11\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$preload" "$(sha "$entrypoint")" "$(sha "$config")" "$(sha "$library")" "$(sha "$control")" "$default_version" "$init_hash"
IFS= read -r -t 30 gate
[[ "$gate" == 'CUEVO_START_FIXED_CRON' ]] || exit 96
if [[ ! ",$preload," =~ ,[[:space:]]*pg_cron[[:space:]]*, ]]; then preload="$preload,pg_cron"; fi
exec "$entrypoint" postgres -D /etc/postgresql -c "shared_preload_libraries=$preload" -c cron.database_name=postgres -c cron.use_background_workers=on -c logging_collector=off -c 'log_line_prefix=%p %e '
