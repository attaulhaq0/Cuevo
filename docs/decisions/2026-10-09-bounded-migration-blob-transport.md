# One bounded migration blob transport

Status: source implementation and local verification in progress. No CI timing target, hosted execution or customer acceptance is claimed.

The existing immutable migration reader launched `git cat-file --batch` once for each 16-file group. Current source has 231 migrations and required 15 blob processes per read, alongside ten current repository/identity checks. Local pinned Node 24 evidence measured 1.8–2.15 seconds per complete read; it does not measure Linux or hosted timing.

Read the same ordered blob IDs in one process. The existing 32 MiB transport cap contains every accepted payload: at most 16 MiB of source bytes plus bounded headers and delimiters for at most 1,000 files. Preserve exact original IDs, blob type, integer sizes, 2 MiB per-blob and 16 MiB aggregate limits, body/header newline checks and complete framing. Oversized or malformed transport remains refused. Git root/HEAD/tree, replacement/graft, dirty-source and physical-byte checks retain their current ownership, environment and timeout.

The canonical and historical readers share the unchanged private decoder. No source bytes, hash, migration order, authority, observation clock, passing receipt or dependency changes. Colocated tests prove one process for 33 actual committed files including binary bytes, current 231-file exact canonical/historical parity, malformed/truncated/wrong-ID/type/size/newline/trailing/missing-frame rejection, actual committed oversized blobs and total payload refusal. Current physical/replacement/root/tree drift tests remain required.
