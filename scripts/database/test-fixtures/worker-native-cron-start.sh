set -euo pipefail
cuevo_preflight_stage=ENTRYPOINT
cuevo_preflight_required_file=''
cuevo_preflight_failure() {
 cuevo_preflight_status=$?
 if [[ "$cuevo_preflight_status" != 0 ]]; then
  if [[ "$cuevo_preflight_stage" == FILES ]]; then
   printf 'CUEVO_CRON_PREFLIGHT_FAILURE_V2\tFILES\t%s\t%s\n' "$cuevo_preflight_required_file" "$cuevo_preflight_status" >&2 || :
  else
   printf 'CUEVO_CRON_PREFLIGHT_FAILURE_V1\t%s\t%s\n' "$cuevo_preflight_stage" "$cuevo_preflight_status" >&2 || :
  fi
 fi
 return "$cuevo_preflight_status"
}
trap cuevo_preflight_failure EXIT
entrypoint=$(command -v docker-entrypoint.sh)
cuevo_preflight_stage=PG_CONFIG_PATHS
config=/etc/postgresql/postgresql.conf
cuevo_postgres=$(readlink -f "$(command -v postgres)")
cuevo_wrapper_hash=$(sha256sum "$cuevo_postgres" | cut -d' ' -f1)
# The pinned image's inspected wrapper exports its own package lib as NIX_PGLIBDIR.
# pg_config describes a separate SDK location; it does not observe this wrapper.
[[ "$cuevo_wrapper_hash" == 'e31ce2e809ffe99f097f2cd7e3a05425a2cfe6a72e2f091519ddcb0c5cc4b663' ]] || exit 90
[[ "$cuevo_postgres" == /nix/store/*-postgresql-and-plugins-17.11/bin/postgres ]] || exit 90
cuevo_postgres_package=${cuevo_postgres%/bin/postgres}
library=$cuevo_postgres_package/lib/pg_cron.so
control=$cuevo_postgres_package/share/postgresql/extension/pg_cron.control
cuevo_preflight_stage=PG_VERSION
version=$(pg_config --version)
[[ "$version" == 'PostgreSQL 17.11' ]] || exit 91
cuevo_preflight_stage=FILES
cuevo_preflight_required_file=ENTRYPOINT
[[ -f "$entrypoint" ]] || exit 92
cuevo_preflight_required_file=CONFIG
[[ -f "$config" ]] || exit 92
cuevo_preflight_required_file=LIBRARY
[[ -f "$library" ]] || exit 92
cuevo_preflight_required_file=CONTROL
[[ -f "$control" ]] || exit 92
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
