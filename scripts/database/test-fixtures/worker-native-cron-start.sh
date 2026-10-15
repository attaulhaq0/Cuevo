set -euo pipefail
cuevo_preflight_stage=ENTRYPOINT
cuevo_preflight_failure() {
 cuevo_preflight_status=$?
 if [[ "$cuevo_preflight_status" != 0 ]]; then
  printf 'CUEVO_CRON_PREFLIGHT_FAILURE_V1\t%s\t%s\n' "$cuevo_preflight_stage" "$cuevo_preflight_status" >&2 || :
 fi
 return "$cuevo_preflight_status"
}
trap cuevo_preflight_failure EXIT
entrypoint=$(command -v docker-entrypoint.sh)
cuevo_preflight_stage=PG_CONFIG_PATHS
config=/etc/postgresql/postgresql.conf
library=$(pg_config --pkglibdir)/pg_cron.so
control=$(pg_config --sharedir)/extension/pg_cron.control
cuevo_preflight_stage=PG_VERSION
version=$(pg_config --version)
[[ "$version" == 'PostgreSQL 17.11' ]] || exit 91
cuevo_preflight_stage=FILES
[[ -f "$entrypoint" && -f "$config" && -f "$library" && -f "$control" ]] || exit 92
cuevo_preflight_stage=PRELOAD_READER
if command -v gosu >/dev/null; then
 preload=$(gosu postgres postgres -D /etc/postgresql -C shared_preload_libraries)
elif command -v runuser >/dev/null; then
 preload=$(runuser -u postgres -- postgres -D /etc/postgresql -C shared_preload_libraries)
else
 exit 93
fi
cuevo_preflight_stage=PRELOAD_VALIDATE
[[ "$preload" =~ ^[a-zA-Z0-9_,\ ]+$ ]] || exit 94
cuevo_preflight_stage=CRON_VERSION
default_version=$(sed -n "s/^[[:space:]]*default_version[[:space:]]*=[[:space:]]*'\([^']*\)'.*/\1/p" "$control")
[[ "$default_version" == '1.6.4' ]] || exit 95
cuevo_preflight_stage=HASHES
sha() { sha256sum "$1" | cut -d' ' -f1; }
init_hash=$(find /docker-entrypoint-initdb.d -type f -print0 | sort -z | xargs -0 -r sha256sum | sha256sum | cut -d' ' -f1)
cuevo_preflight_stage=METADATA
printf 'CUEVO_CRON_STARTUP_V1\t17.11\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$preload" "$(sha "$entrypoint")" "$(sha "$config")" "$(sha "$library")" "$(sha "$control")" "$default_version" "$init_hash"
cuevo_preflight_stage=GATE
IFS= read -r -t 30 gate
[[ "$gate" == 'CUEVO_START_FIXED_CRON' ]] || exit 96
if [[ ! ",$preload," =~ ,[[:space:]]*pg_cron[[:space:]]*, ]]; then preload="$preload,pg_cron"; fi
trap - EXIT
exec "$entrypoint" postgres -D /etc/postgresql -c "shared_preload_libraries=$preload" -c cron.database_name=postgres -c cron.use_background_workers=on -c logging_collector=off -c 'log_line_prefix=%p %e '
