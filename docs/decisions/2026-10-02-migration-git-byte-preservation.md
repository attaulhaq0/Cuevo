# Preserve applied migration bytes when committing

Status: verified local Git publishing control. Applied migration SQL remains unchanged.

Twelve newly authored/applied migration files contain CRLF bytes. The repository's default text filter would convert those bytes to LF during staging, making the committed source hash differ from the applied and reviewed source. Exact-path `-text -eol` attributes preserve those12 raw sources; the remaining historical migration attributes and canonical Git blobs are unchanged. Do not apply a broad SQL binary rule or renormalize history.

An isolated ignored Git index staged only the attributes and12 sources. Each staged blob's SHA256 matched its original raw bytes; all79 previously tracked migration blobs remained HEAD-identical. The real index was not changed by this check. Receipt: `.local/commit-byte-audit/receipt.json`. This Git publishing control follows the11:30 runtime snapshot and is not claimed as part of that earlier authored-source freeze.

New migrations should use LF before their first application. If an already applied source has different immutable bytes, add only its exact path exception and verify staged/check-out bytes rather than changing the SQL. Historical reports retain their original source hashes and canonical source identities. Future hosted replay must use the preserved committed bytes.
