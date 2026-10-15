-- SOURCE ONLY: no connection or execution is authorized by this file.
-- Fixed private current-state inventory; never original pre-write custody or approval.
-- The project endpoint must be independently admitted by a future read-only caller.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL search_path = pg_catalog;
DO $facts$
DECLARE
  observed_statement_at timestamptz := pg_catalog.statement_timestamp();
  observed_read_started_at timestamptz := pg_catalog.clock_timestamp();
  ns oid := pg_catalog.to_regnamespace('cuevo_probe_80390cdc1e2841079020');
  tab oid := pg_catalog.to_regclass('cuevo_probe_80390cdc1e2841079020.control');
  proc oid := pg_catalog.to_regprocedure('cuevo_probe_80390cdc1e2841079020.run_probe(text)');
  operator_oid oid; database_oid oid; actor jsonb; scoped_setting jsonb;
  inventory jsonb; acl_inventory jsonb; column_inventory jsonb; privacy jsonb;
  probe_rows jsonb := NULL; probe jsonb := NULL; jobs jsonb := NULL;
  runs jsonb := NULL; backends jsonb := NULL; issues jsonb := '[]'::jsonb;
  job_id bigint := NULL; bound_pid integer := NULL; bound_start timestamptz := NULL;
  run_pids integer[] := NULL; run_bindings jsonb := NULL;
  probe_shape_safe boolean := false; cron_job_safe boolean := false;
  cron_runs_safe boolean := false; owned_job_matches boolean := false; census_complete boolean := false;
  run_count integer; backend_count integer; inventory_extra boolean := false;
  expected_command constant text := 'CALL cuevo_probe_80390cdc1e2841079020.run_probe(''ea7827b30f43ff850ef46ae562d5ca1aacabbdaffc84752fa62de9660f5f6a42'');';
  response jsonb;
BEGIN
  SELECT oid INTO operator_oid FROM pg_catalog.pg_roles WHERE rolname = 'postgres';
  SELECT oid INTO database_oid FROM pg_catalog.pg_database WHERE datname = 'postgres';
  actor := pg_catalog.jsonb_build_object(
    'sessionUser', session_user, 'currentUser', current_user,
    'role', pg_catalog.current_setting('role'), 'database', pg_catalog.current_database(),
    'sessionUserOid', (SELECT oid::text FROM pg_catalog.pg_roles WHERE rolname = session_user),
    'currentUserOid', (SELECT oid::text FROM pg_catalog.pg_roles WHERE rolname = current_user),
    'operatorRoleOid', operator_oid::text, 'databaseOid', database_oid::text,
    'superuser', (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = session_user),
    'ssl', (SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid = pg_catalog.pg_backend_pid()),
    'backendPid', pg_catalog.pg_backend_pid(),
    'backendStart', (SELECT backend_start FROM pg_catalog.pg_stat_activity WHERE pid = pg_catalog.pg_backend_pid()));
  IF session_user <> 'postgres' OR current_user <> 'postgres'
     OR pg_catalog.current_setting('role') <> 'none' OR pg_catalog.current_database() <> 'postgres'
     OR (actor->>'superuser')::boolean IS DISTINCT FROM false
     OR (actor->>'ssl')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Fixed read-only operator identity required' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.jsonb_build_object('roleOid', operator_oid::text,
    'databaseOid', database_oid::text, 'rowPresent', EXISTS(
      SELECT 1 FROM pg_catalog.pg_db_role_setting WHERE setrole = operator_oid AND setdatabase = database_oid),
    'entries', (SELECT pg_catalog.to_jsonb(setconfig) FROM pg_catalog.pg_db_role_setting
      WHERE setrole = operator_oid AND setdatabase = database_oid),
    'rawRow', (SELECT pg_catalog.to_jsonb(s) FROM pg_catalog.pg_db_role_setting s
      WHERE s.setrole = operator_oid AND s.setdatabase = database_oid)) INTO scoped_setting;

  -- Only the exact schema is inventoried. OIDs retain identity separately from names.
  -- Namespace-dependent objects are bounded and checked against the original shape.
  IF ns IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace = ns
      AND NOT (relname = 'control' AND relkind = 'r' OR relname = 'control_pkey' AND relkind = 'i'))
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace = ns AND oid IS DISTINCT FROM proc)
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE typnamespace = ns
        AND NOT (COALESCE(typrelid = tab AND typtype = 'c', false)
          OR COALESCE(typelem = (SELECT reltype FROM pg_catalog.pg_class WHERE oid = tab) AND typtype = 'b', false)))
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_depend d WHERE d.refclassid = 'pg_catalog.pg_namespace'::regclass
        AND d.refobjid = ns AND NOT (
          d.classid = 'pg_catalog.pg_class'::regclass AND d.objid IN (SELECT oid FROM pg_catalog.pg_class WHERE relnamespace = ns)
          OR d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid IS NOT DISTINCT FROM proc
          OR d.classid = 'pg_catalog.pg_type'::regclass AND d.objid IN (SELECT oid FROM pg_catalog.pg_type WHERE typnamespace = ns)))
      INTO inventory_extra;
    SELECT pg_catalog.jsonb_build_object(
      'namespaceName', n.nspname, 'namespaceOid', n.oid::text,
      'namespaceOwnerOid', n.nspowner::text, 'namespaceOwner', pg_catalog.pg_get_userbyid(n.nspowner),
      'tableName', 'control', 'tableOid', tab::text,
      'tableOwnerOid', (SELECT relowner::text FROM pg_catalog.pg_class WHERE oid = tab),
      'tableOwner', (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid = tab),
      'tableRls', (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = tab),
      'tableForceRls', (SELECT relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = tab),
      'procedureName', 'run_probe', 'procedureOid', proc::text,
      'procedureIdentityArguments', (SELECT pg_catalog.pg_get_function_identity_arguments(oid) FROM pg_catalog.pg_proc WHERE oid = proc),
      'procedureKind', (SELECT prokind FROM pg_catalog.pg_proc WHERE oid = proc),
      'procedureOwnerOid', (SELECT proowner::text FROM pg_catalog.pg_proc WHERE oid = proc),
      'procedureOwner', (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid = proc),
      'procedureMd5', (SELECT pg_catalog.md5(prosrc) FROM pg_catalog.pg_proc WHERE oid = proc),
      'procedureConfig', (SELECT pg_catalog.to_jsonb(proconfig) FROM pg_catalog.pg_proc WHERE oid = proc),
      'invoker', (SELECT NOT prosecdef FROM pg_catalog.pg_proc WHERE oid = proc),
      'relations', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'oid', oid::text, 'name', relname, 'kind', relkind, 'ownerOid', relowner::text,
        'owner', pg_catalog.pg_get_userbyid(relowner), 'rawAcl', pg_catalog.to_jsonb(relacl)) ORDER BY oid), '[]'::jsonb)
        FROM (SELECT * FROM pg_catalog.pg_class WHERE relnamespace = ns ORDER BY oid LIMIT 65) bounded),
      'procedures', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'oid', oid::text, 'name', proname, 'kind', prokind, 'ownerOid', proowner::text,
        'config', pg_catalog.to_jsonb(proconfig), 'invoker', NOT prosecdef,
        'identityArguments', pg_catalog.pg_get_function_identity_arguments(oid)) ORDER BY oid), '[]'::jsonb)
        FROM (SELECT * FROM pg_catalog.pg_proc WHERE pronamespace = ns ORDER BY oid LIMIT 65) bounded),
      'types', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'oid', oid::text, 'name', typname, 'kind', typtype, 'relationOid', typrelid::text,
        'elementOid', typelem::text, 'ownerOid', typowner::text) ORDER BY oid), '[]'::jsonb)
        FROM (SELECT * FROM pg_catalog.pg_type WHERE typnamespace = ns ORDER BY oid LIMIT 65) bounded),
      'namespaceDependencies', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(bounded)
        ORDER BY classid, objid, objsubid), '[]'::jsonb) FROM (
        SELECT classid::text, objid::text, objsubid, deptype FROM pg_catalog.pg_depend
        WHERE refclassid = 'pg_catalog.pg_namespace'::regclass AND refobjid = ns
        ORDER BY classid, objid, objsubid LIMIT 65) bounded),
      'constraints', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'oid', oid::text, 'name', conname, 'kind', contype, 'validated', convalidated) ORDER BY oid), '[]'::jsonb)
        FROM (SELECT * FROM pg_catalog.pg_constraint WHERE conrelid = tab ORDER BY oid LIMIT 65) bounded),
      'triggerCount', (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger WHERE tgrelid = tab),
      'policyCount', (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy WHERE polrelid = tab),
      'extraObjects', inventory_extra) INTO inventory FROM pg_catalog.pg_namespace n WHERE n.oid = ns;
    IF inventory_extra THEN issues := issues || '"EXTRA_OWNED_SCHEMA_OBJECTS"'::jsonb; END IF;
    IF tab IS NULL OR proc IS NULL OR inventory->>'namespaceOwner' IS DISTINCT FROM 'postgres'
      OR inventory->>'tableOwner' IS DISTINCT FROM 'postgres' OR inventory->>'procedureOwner' IS DISTINCT FROM 'postgres'
      OR inventory->>'procedureKind' IS DISTINCT FROM 'p' OR inventory->>'invoker' IS DISTINCT FROM 'true'
      OR inventory->'procedureConfig' IS DISTINCT FROM 'null'::jsonb
      OR pg_catalog.jsonb_array_length(inventory->'relations') <> 2
      OR pg_catalog.jsonb_array_length(inventory->'procedures') <> 1
      OR pg_catalog.jsonb_array_length(inventory->'types') <> 2
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace = ns AND relowner <> operator_oid)
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint WHERE conrelid = tab) <> 3
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = tab
        AND NOT (conname = 'control_pkey' AND contype = 'p'
          OR conname IN ('control_singleton_check', 'control_phase_check') AND contype = 'c'))
      OR (inventory->>'triggerCount')::bigint <> 0 OR (inventory->>'policyCount')::bigint <> 0 THEN
      issues := issues || '"OWNED_OBJECT_MISSING_OR_IDENTITY_CONFLICT"'::jsonb;
    END IF;
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class WHERE relnamespace = ns) > 64
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc WHERE pronamespace = ns) > 64
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_type WHERE typnamespace = ns) > 64
      OR pg_catalog.jsonb_array_length(inventory->'namespaceDependencies') > 64
      OR pg_catalog.jsonb_array_length(inventory->'constraints') > 64 THEN
      issues := issues || '"OBJECT_INVENTORY_TRUNCATED"'::jsonb;
    END IF;
  ELSE issues := issues || '"PROBE_SCHEMA_ABSENT_CURRENT_OBSERVATION_ONLY"'::jsonb;
  END IF;

  -- NULL ACL is reported verbatim and separately expanded through acldefault.
  WITH targets(kind, object_oid, owner_oid, raw_acl, default_kind) AS (
    SELECT 'schema', oid, nspowner, nspacl, 'n'::"char" FROM pg_catalog.pg_namespace WHERE oid = ns
    UNION ALL SELECT 'table', oid, relowner, relacl, 'r'::"char" FROM pg_catalog.pg_class WHERE oid = tab AND relkind = 'r'
    UNION ALL SELECT 'procedure', oid, proowner, proacl, 'f'::"char" FROM pg_catalog.pg_proc WHERE oid = proc
  ) SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'kind', t.kind, 'oid', t.object_oid::text, 'rawAcl', pg_catalog.to_jsonb(t.raw_acl),
    'normalizedAcl', pg_catalog.to_jsonb(COALESCE(t.raw_acl, pg_catalog.acldefault(t.default_kind, t.owner_oid))),
    'grants', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(g) ORDER BY g.grantor_oid, g.grantee_oid, g.grantable), '[]'::jsonb)
      FROM (SELECT x.grantor::text AS grantor_oid, pg_catalog.pg_get_userbyid(x.grantor) AS grantor,
        x.grantee::text AS grantee_oid, CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END AS grantee,
        x.is_grantable AS grantable, pg_catalog.jsonb_agg(x.privilege_type ORDER BY x.privilege_type) AS privileges
        FROM pg_catalog.aclexplode(COALESCE(t.raw_acl, pg_catalog.acldefault(t.default_kind, t.owner_oid))) x
        GROUP BY x.grantor, x.grantee, x.is_grantable) g)) ORDER BY t.kind), '[]'::jsonb)
    INTO acl_inventory FROM targets t;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'number', a.attnum, 'name', a.attname, 'typeOid', a.atttypid::text,
    'rawAcl', pg_catalog.to_jsonb(a.attacl),
    'normalizedAcl', pg_catalog.to_jsonb(COALESCE(a.attacl, pg_catalog.acldefault('c', c.relowner))),
    'grants', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(g) ORDER BY g.grantor_oid, g.grantee_oid, g.grantable), '[]'::jsonb)
      FROM (SELECT x.grantor::text AS grantor_oid, pg_catalog.pg_get_userbyid(x.grantor) AS grantor,
        x.grantee::text AS grantee_oid, CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END AS grantee,
        x.is_grantable AS grantable, pg_catalog.jsonb_agg(x.privilege_type ORDER BY x.privilege_type) AS privileges
        FROM pg_catalog.aclexplode(COALESCE(a.attacl, pg_catalog.acldefault('c', c.relowner))) x
        GROUP BY x.grantor, x.grantee, x.is_grantable) g)) ORDER BY a.attnum), '[]'::jsonb)
    INTO column_inventory FROM (SELECT * FROM pg_catalog.pg_attribute
      WHERE attrelid = tab AND attnum > 0 AND NOT attisdropped ORDER BY attnum LIMIT 65) a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid;
  IF pg_catalog.jsonb_array_length(column_inventory) > 64 THEN issues := issues || '"COLUMN_INVENTORY_TRUNCATED"'::jsonb; END IF;
  IF tab IS NOT NULL AND pg_catalog.jsonb_array_length(column_inventory) <> 40 THEN
    issues := issues || '"ORIGINAL_CONTROL_COLUMN_SHAPE_CONFLICT"'::jsonb;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(acl_inventory) a
      WHERE pg_catalog.jsonb_array_length(a->'normalizedAcl') > 64 OR pg_catalog.jsonb_array_length(a->'grants') > 64)
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(column_inventory) a
      WHERE pg_catalog.jsonb_array_length(a->'normalizedAcl') > 64 OR pg_catalog.jsonb_array_length(a->'grants') > 64) THEN
    issues := issues || '"ACL_INVENTORY_OVER_BOUND"'::jsonb;
  END IF;

  WITH actors(name, public_role) AS (VALUES ('PUBLIC', true), ('anon', false), ('authenticated', false),
    ('service_role', false), ('cuevo_api', false), ('cuevo_worker', false), ('authenticator', false)),
  roles AS (SELECT a.*, r.oid FROM actors a LEFT JOIN pg_catalog.pg_roles r ON NOT a.public_role AND r.rolname = a.name)
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role', r.name,
    'roleOid', CASE WHEN r.public_role THEN '0' ELSE r.oid::text END, 'rolePresent', r.public_role OR r.oid IS NOT NULL,
    'schemaUsage', CASE WHEN ns IS NULL OR NOT r.public_role AND r.oid IS NULL THEN NULL
      WHEN r.public_role THEN EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n,
        LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) x
        WHERE n.oid = ns AND x.grantee = 0 AND x.privilege_type = 'USAGE') ELSE pg_catalog.has_schema_privilege(r.oid, ns, 'USAGE') END,
    'schemaCreate', CASE WHEN ns IS NULL OR NOT r.public_role AND r.oid IS NULL THEN NULL
      WHEN r.public_role THEN EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n,
        LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) x
        WHERE n.oid = ns AND x.grantee = 0 AND x.privilege_type = 'CREATE') ELSE pg_catalog.has_schema_privilege(r.oid, ns, 'CREATE') END,
    'tablePrivileges', (SELECT pg_catalog.jsonb_object_agg(v.privilege, CASE
      WHEN tab IS NULL OR NOT r.public_role AND r.oid IS NULL THEN NULL
      WHEN v.privilege = 'MAINTAIN' AND pg_catalog.current_setting('server_version_num')::integer < 170000 THEN NULL
      WHEN r.public_role THEN EXISTS(SELECT 1 FROM pg_catalog.pg_class c,
        LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
        WHERE c.oid = tab AND x.grantee = 0 AND x.privilege_type = v.privilege)
      ELSE pg_catalog.has_table_privilege(r.oid, tab, v.privilege) END)
      FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) v(privilege)),
    'anyColumnPrivileges', (SELECT pg_catalog.jsonb_object_agg(v.privilege, CASE
      WHEN tab IS NULL OR NOT r.public_role AND r.oid IS NULL THEN NULL
      WHEN r.public_role THEN EXISTS(SELECT 1 FROM pg_catalog.pg_class c,
        LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) x
        WHERE c.oid = tab AND x.grantee = 0 AND x.privilege_type = v.privilege)
        OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a,
          LATERAL pg_catalog.aclexplode(COALESCE(a.attacl, '{}'::aclitem[])) x
          WHERE a.attrelid = tab AND a.attnum > 0 AND NOT a.attisdropped AND x.grantee = 0 AND x.privilege_type = v.privilege)
      ELSE pg_catalog.has_any_column_privilege(r.oid, tab, v.privilege) END)
      FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) v(privilege)),
    'procedureExecute', CASE WHEN proc IS NULL OR NOT r.public_role AND r.oid IS NULL THEN NULL
      WHEN r.public_role THEN EXISTS(SELECT 1 FROM pg_catalog.pg_proc p,
        LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) x
        WHERE p.oid = proc AND x.grantee = 0 AND x.privilege_type = 'EXECUTE') ELSE pg_catalog.has_function_privilege(r.oid, proc, 'EXECUTE') END)
    ORDER BY r.name) INTO privacy FROM roles r;
  IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(privacy) r WHERE r->>'rolePresent' = 'false') THEN
    issues := issues || '"EXCLUDED_ROLE_ABSENT_PRIVILEGES_UNKNOWN"'::jsonb;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(privacy) r
      WHERE r->>'schemaUsage' = 'true' OR r->>'schemaCreate' = 'true' OR r->>'procedureExecute' = 'true'
        OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(r->'tablePrivileges') p WHERE p.value = 'true'::jsonb)
        OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(r->'anyColumnPrivileges') p WHERE p.value = 'true'::jsonb)) THEN
    issues := issues || '"EXCLUDED_ROLE_OR_PUBLIC_EFFECTIVE_PRIVILEGE_CONFLICT"'::jsonb;
  END IF;

  -- Avoid views, RLS expressions, foreign tables, or custom type output functions.
  SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid = tab AND c.relkind = 'r'
    AND c.relowner = operator_oid AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity)
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = tab AND a.attnum > 0 AND NOT a.attisdropped
      AND a.atttypid NOT IN ('boolean'::regtype, 'uuid'::regtype, 'text'::regtype, 'text[]'::regtype,
        'timestamp with time zone'::regtype, 'oid'::regtype, 'bigint'::regtype, 'integer'::regtype))
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhparent = tab)
    INTO probe_shape_safe;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhparent = tab) THEN
    issues := issues || '"CONTROL_INHERITANCE_CONFLICT"'::jsonb;
  END IF;
  IF tab IS NOT NULL AND probe_shape_safe THEN
    EXECUTE 'SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c)), ''[]''::jsonb) FROM (SELECT * FROM ONLY cuevo_probe_80390cdc1e2841079020.control LIMIT 2) c' INTO probe_rows;
    IF pg_catalog.jsonb_array_length(probe_rows) = 1 AND pg_catalog.octet_length(probe_rows::text) <= 65536 THEN
      probe := probe_rows->0;
      IF probe->>'operation_id' IS DISTINCT FROM '80390cdc-1e28-4107-9020-253cd7d8a588'
        OR probe->>'operation_sha256' IS DISTINCT FROM 'ea7827b30f43ff850ef46ae562d5ca1aacabbdaffc84752fa62de9660f5f6a42'
        OR probe->>'source_unit_sha256' IS DISTINCT FROM 'd8dc3ac3106299866b142096bfb5b85edec2f076831774a4222d26a48d130a8d'
        OR probe->>'migration_sha256' IS DISTINCT FROM 'b4e4692ae0bced49d5510d5079603055ccf48f7d4ba8e26f7a5251a3c6cf3b40'
        OR probe->>'command' IS DISTINCT FROM expected_command
        OR probe->>'job_name' IS DISTINCT FROM 'cuevo-commit-timeout-80390cdc-1e28-4107-9020-253cd7d8a588'
        OR probe->>'procedure_oid' IS DISTINCT FROM proc::text
        OR probe->>'procedure_source_md5' IS DISTINCT FROM 'cf62507076e7a1b907f661e693c847f2'
        OR inventory->>'procedureMd5' IS DISTINCT FROM 'cf62507076e7a1b907f661e693c847f2' THEN
        issues := issues || '"STORED_OR_CURRENT_PROBE_IDENTITY_CONFLICT"'::jsonb;
      ELSIF probe->>'job_id' ~ '^[1-9][0-9]{0,18}$' AND (probe->>'job_id')::numeric <= 9223372036854775807 THEN
        job_id := (probe->>'job_id')::bigint;
        IF probe->>'backend_pid' ~ '^[1-9][0-9]{0,9}$' AND (probe->>'backend_pid')::numeric <= 2147483647 THEN
          bound_pid := (probe->>'backend_pid')::integer;
          -- to_jsonb(timestamptz) supplies the typed original clock, never a caller string.
          IF pg_catalog.jsonb_typeof(probe->'backend_start') = 'string' THEN bound_start := (probe->>'backend_start')::timestamptz; END IF;
        END IF;
      ELSE issues := issues || '"STORED_JOB_ID_UNKNOWN"'::jsonb;
      END IF;
    ELSE issues := issues || '"CONTROL_ROW_COUNT_OR_SIZE_UNKNOWN"'::jsonb; probe_rows := NULL;
    END IF;
  ELSE issues := issues || '"CONTROL_ABSENT_OR_UNSAFE_SHAPE"'::jsonb;
  END IF;

  -- Only extension-owned regular Cron metadata tables are ever read.
  SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_depend d
    ON d.classid = 'pg_catalog.pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
    JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
    WHERE c.oid = pg_catalog.to_regclass('cron.job') AND c.relkind = 'r' AND e.extname = 'pg_cron'
      AND d.refclassid = 'pg_catalog.pg_extension'::regclass AND d.objsubid = 0
      AND c.relowner = e.extowner AND pg_catalog.pg_get_userbyid(e.extowner) = 'supabase_admin'
      AND c.relnamespace = pg_catalog.to_regnamespace('cron')
      AND (SELECT nspowner FROM pg_catalog.pg_namespace WHERE oid = c.relnamespace) = e.extowner) INTO cron_job_safe;
  SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_depend d
    ON d.classid = 'pg_catalog.pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
    JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
    WHERE c.oid = pg_catalog.to_regclass('cron.job_run_details') AND c.relkind = 'r' AND e.extname = 'pg_cron'
      AND d.refclassid = 'pg_catalog.pg_extension'::regclass AND d.objsubid = 0
      AND c.relowner = e.extowner AND pg_catalog.pg_get_userbyid(e.extowner) = 'supabase_admin'
      AND c.relnamespace = pg_catalog.to_regnamespace('cron')
      AND (SELECT nspowner FROM pg_catalog.pg_namespace WHERE oid = c.relnamespace) = e.extowner) INTO cron_runs_safe;
  -- A forged/custom column or policy must not invoke a type or policy function.
  SELECT cron_job_safe AND NOT EXISTS(SELECT 1 FROM (VALUES
    ('jobid', 'pg_catalog.int8'::regtype), ('jobname', 'pg_catalog.text'::regtype),
    ('command', 'pg_catalog.text'::regtype), ('username', 'pg_catalog.text'::regtype),
    ('database', 'pg_catalog.text'::regtype), ('nodename', 'pg_catalog.text'::regtype),
    ('nodeport', 'pg_catalog.int4'::regtype), ('schedule', 'pg_catalog.text'::regtype),
    ('active', 'pg_catalog.bool'::regtype)) expected(name, type_oid)
    WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = pg_catalog.to_regclass('cron.job')
      AND a.attname = expected.name AND a.atttypid = expected.type_oid AND a.attnum > 0 AND NOT a.attisdropped))
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid = pg_catalog.to_regclass('cron.job')
      AND (p.polqual IS NOT NULL AND pg_catalog.pg_get_expr(p.polqual, p.polrelid) <> '(username = CURRENT_USER)'
        OR p.polwithcheck IS NOT NULL AND pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) <> '(username = CURRENT_USER)'))
    INTO cron_job_safe;
  SELECT cron_runs_safe AND NOT EXISTS(SELECT 1 FROM (VALUES
    ('runid', 'pg_catalog.int8'::regtype), ('jobid', 'pg_catalog.int8'::regtype),
    ('job_pid', 'pg_catalog.int4'::regtype), ('status', 'pg_catalog.text'::regtype),
    ('start_time', 'pg_catalog.timestamptz'::regtype), ('end_time', 'pg_catalog.timestamptz'::regtype),
    ('username', 'pg_catalog.text'::regtype), ('database', 'pg_catalog.text'::regtype),
    ('command', 'pg_catalog.text'::regtype), ('return_message', 'pg_catalog.text'::regtype)) expected(name, type_oid)
    WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = pg_catalog.to_regclass('cron.job_run_details')
      AND a.attname = expected.name AND a.atttypid = expected.type_oid AND a.attnum > 0 AND NOT a.attisdropped))
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid = pg_catalog.to_regclass('cron.job_run_details')
      AND (p.polqual IS NOT NULL AND pg_catalog.pg_get_expr(p.polqual, p.polrelid) <> '(username = CURRENT_USER)'
        OR p.polwithcheck IS NOT NULL AND pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) <> '(username = CURRENT_USER)'))
    INTO cron_runs_safe;
  -- Any descendant necessarily has a first child recorded under the fixed OID.
  -- Refuse that inheritance shape and use ONLY even after the catalog read.
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhparent = pg_catalog.to_regclass('cron.job')) THEN
    cron_job_safe := false;
    issues := issues || '"CRON_JOB_INHERITANCE_CONFLICT"'::jsonb;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhparent = pg_catalog.to_regclass('cron.job_run_details')) THEN
    cron_runs_safe := false;
    issues := issues || '"CRON_RUN_HISTORY_INHERITANCE_CONFLICT"'::jsonb;
  END IF;
  IF cron_job_safe THEN
    EXECUTE 'SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(''jobId'',jobid::text,''jobName'',jobname,''command'',command,''username'',username,''database'',database,''host'',nodename,''port'',nodeport,''schedule'',schedule,''active'',active) ORDER BY jobid),''[]''::jsonb) FROM (SELECT * FROM ONLY cron.job WHERE jobname=''cuevo-commit-timeout-80390cdc-1e28-4107-9020-253cd7d8a588'' OR command=$1 ORDER BY jobid LIMIT 3) j'
      INTO jobs USING expected_command;
    IF pg_catalog.jsonb_array_length(jobs) <> 1 OR job_id IS NULL
      OR jobs->0->>'jobId' IS DISTINCT FROM job_id::text OR jobs->0->>'command' IS DISTINCT FROM expected_command
      OR jobs->0->>'username' IS DISTINCT FROM 'postgres' OR jobs->0->>'database' IS DISTINCT FROM 'postgres'
      OR jobs->0->>'jobName' IS DISTINCT FROM probe->>'job_name'
      OR jobs->0->>'host' IS DISTINCT FROM pg_catalog.current_setting('cron.host', true)
      OR jobs->0->>'port' IS DISTINCT FROM pg_catalog.current_setting('port')
      OR pg_catalog.jsonb_typeof(jobs->0->'active') IS DISTINCT FROM 'boolean'
      OR NULLIF(jobs->0->>'schedule', '') IS NULL THEN
      issues := issues || '"OWNED_JOB_ABSENT_EXTRA_OR_CONFLICTING"'::jsonb;
    ELSE owned_job_matches := true;
      IF probe->>'phase' IN ('ARMED', 'RESTORED')
        AND jobs->0->>'schedule' IS DISTINCT FROM probe->>'armed_schedule'
        OR probe->>'phase' = 'PREPARED' AND jobs->0->>'schedule' IS DISTINCT FROM probe->>'prepared_schedule' THEN
        owned_job_matches := false;
        issues := issues || '"STORED_SCHEDULE_JOB_CONFLICT"'::jsonb;
      END IF;
    END IF;
  ELSE issues := issues || '"CRON_JOB_ABSENT_OR_NATIVE_OWNERSHIP_TYPE_POLICY_DRIFT"'::jsonb;
  END IF;
  IF cron_runs_safe AND owned_job_matches THEN
    EXECUTE 'SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(''runId'',runid::text,''jobId'',jobid::text,''jobPid'',job_pid,''status'',status,''startTime'',start_time,''endTime'',end_time,''username'',username,''database'',database,''command'',command,''privateReturnMessage'',pg_catalog.left(return_message,4096),''returnMessageCharacters'',pg_catalog.length(return_message),''returnMessageBytes'',pg_catalog.octet_length(return_message),''returnMessageTruncated'',pg_catalog.length(return_message)>4096) ORDER BY runid),''[]''::jsonb) FROM (SELECT * FROM ONLY cron.job_run_details WHERE jobid=$1 ORDER BY runid LIMIT 65) r'
      INTO runs USING job_id;
    run_count := pg_catalog.jsonb_array_length(runs);
    IF run_count > 64 THEN issues := issues || '"OWNED_RUNS_TRUNCATED"'::jsonb; END IF;
    IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(runs) r WHERE r->>'command' IS DISTINCT FROM expected_command
      OR r->>'username' IS DISTINCT FROM 'postgres' OR r->>'database' IS DISTINCT FROM 'postgres'
      OR r->>'returnMessageTruncated' = 'true' OR r->>'status' IS NULL
      OR r->>'status' NOT IN ('starting', 'connecting', 'sending', 'running', 'succeeded', 'failed')) THEN
      issues := issues || '"OWNED_RUN_IDENTITY_OR_RETURN_TRUNCATION_CONFLICT"'::jsonb;
    END IF;
    SELECT pg_catalog.array_agg(DISTINCT (r->>'jobPid')::integer) FILTER (WHERE r->>'jobPid' IS NOT NULL),
      COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('pid', r->'jobPid', 'runId', r->'runId',
        'startTime', r->'startTime', 'endTime', r->'endTime')), '[]'::jsonb)
      INTO run_pids, run_bindings FROM pg_catalog.jsonb_array_elements(runs) r
      WHERE r->>'command' = expected_command AND r->>'username' = 'postgres' AND r->>'database' = 'postgres';
  ELSE issues := issues || '"RUN_HISTORY_OR_ORIGINAL_JOB_BINDING_UNKNOWN"'::jsonb;
  END IF;
  IF owned_job_matches THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'pid', a.pid, 'backendStart', a.backend_start, 'state', a.state, 'backendType', a.backend_type,
      'username', a.usename, 'database', a.datname,
      'queryVisible', a.query IS NOT NULL AND a.query <> '<insufficient privilege>',
      'queryMatchesRecordedCommand', a.query = expected_command,
      'matchesOriginalPidAndBackendStart', a.pid = bound_pid AND a.backend_start = bound_start,
      'associatedRunIds', (SELECT COALESCE(pg_catalog.jsonb_agg(b->'runId'), '[]'::jsonb)
        FROM pg_catalog.jsonb_array_elements(run_bindings) b WHERE (b->>'pid')::integer = a.pid),
      'ownershipAmbiguous', a.query IS DISTINCT FROM expected_command
        AND (a.pid = bound_pid AND a.backend_start = bound_start) IS DISTINCT FROM true)
      ORDER BY a.pid), '[]'::jsonb) INTO backends FROM (
      SELECT * FROM pg_catalog.pg_stat_activity WHERE pid <> pg_catalog.pg_backend_pid()
        AND (query = expected_command OR pid = bound_pid AND backend_start = bound_start OR pid = ANY(run_pids))
      ORDER BY pid LIMIT 65) a;
    backend_count := pg_catalog.jsonb_array_length(backends);
    census_complete := run_count IS NOT NULL AND run_count <= 64 AND backend_count <= 64
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(backends) a
        WHERE a->>'ownershipAmbiguous' = 'true' OR a->>'queryVisible' = 'false');
    IF NOT census_complete THEN issues := issues || '"OWNED_BACKEND_CENSUS_UNKNOWN_OR_TRUNCATED"'::jsonb; END IF;
  END IF;

  response := pg_catalog.jsonb_build_object(
    'kind', 'FIXED_CURRENT_READ_ONLY_FACTS', 'expectedProject', 'mqxdjvsyckzocokuikmx',
    'projectIdentityFromSql', NULL, 'operationId', '80390cdc-1e28-4107-9020-253cd7d8a588',
    'statementAt', observed_statement_at, 'readStartedAt', observed_read_started_at,
    'readCompletedAt', pg_catalog.clock_timestamp(), 'transactionStartedAt', pg_catalog.transaction_timestamp(),
    'actor', actor, 'setting', scoped_setting, 'probeRows', probe_rows,
    'inventory', inventory, 'objectAcls', acl_inventory, 'columnAcls', column_inventory,
    'effectivePrivileges', privacy, 'jobs', jobs, 'runs', runs,
    'cronMetadataGuards', pg_catalog.jsonb_build_object('jobNativeShapeSafe', cron_job_safe,
      'runNativeShapeSafe', cron_runs_safe, 'exactOwnedJobMatches', owned_job_matches),
    'ownedBackendCandidates', backends, 'ownedBackendCensusComplete', census_complete,
    'ownedBackendPresent', CASE WHEN census_complete AND pg_catalog.jsonb_array_length(issues) = 0 THEN backend_count > 0 ELSE NULL END,
    'cronExtension', (SELECT pg_catalog.jsonb_build_object('oid', oid::text, 'version', extversion,
      'ownerOid', extowner::text, 'owner', pg_catalog.pg_get_userbyid(extowner)) FROM pg_catalog.pg_extension WHERE extname = 'pg_cron'),
    'serverSettings', pg_catalog.jsonb_build_object('statementTimeout', pg_catalog.current_setting('statement_timeout'),
      'cronBackgroundWorkers', pg_catalog.current_setting('cron.use_background_workers', true),
      'cronHost', pg_catalog.current_setting('cron.host', true), 'port', pg_catalog.current_setting('port'),
      'serverVersionNumber', pg_catalog.current_setting('server_version_num')),
    'issues', issues, 'status', 'UNKNOWN_REQUIRES_EXTERNAL_TARGET_AND_ORIGINAL_CUSTODY',
    'originalPreWriteCustodyEstablished', false, 'originalArmCustodyEstablished', false,
    'nativeExecutionAuthorized', false, 'nativeAcceptance', false,
    'authenticCustodyCreated', false, 'futureEffectAdmitted', false);
  IF pg_catalog.octet_length(response::text) > 1048576 THEN
    response := pg_catalog.jsonb_build_object('kind', 'FIXED_CURRENT_READ_ONLY_FACTS',
      'status', 'UNKNOWN_RESPONSE_SIZE_LIMIT', 'nativeExecutionAuthorized', false,
      'nativeAcceptance', false, 'authenticCustodyCreated', false, 'futureEffectAdmitted', false);
  END IF;
  PERFORM pg_catalog.set_config('cuevo.readonly_current_facts', response::text, true);
END
$facts$;
SELECT pg_catalog.current_setting('cuevo.readonly_current_facts', true)::jsonb AS "privateCurrentFacts";
ROLLBACK;
