# Local invitation capture transport

Date: 3 October 2026. This checkpoint verifies the existing local Mailpit capture transport; recipient admission and production email delivery remain separate requirements.

`identity/local-account-mail.ts` accepts only explicit LOCAL_SYNTHETIC and the exact local Cuevo web origin. It validates an invite continuation with request identity and independent application/provider credentials solely in its fragment, then posts one bilingual text message to `http://127.0.0.1:56324/api/v1/send`. It follows no redirect, bounds requests to5seconds, caps response bytes and exposes only ACCEPTED. It has no automatic retry, remote SMTP configuration or provider key. Local captured content necessarily contains the one-use continuation; it does not enter SQL, outbox, logs or reports.

The first actual capture failed because the response validator expected a UUID. The installed Mailpit1.31.3 returns its own database ID string; current versioned OpenAPI confirms that contract. A red unit with that actual ID shape reproduced the issue, then the corrected bounded ID validator passed. The actual capture test proves one exact recipient, bilingual subject/body, fragment link readback and deletion of only its owned captured message. Unknown outcomes trigger ownership lookup before cleanup, never global mailbox deletion.

Offline checks passed17/17. The actual local capture/readback test passed1/1 in1.66seconds. Negative tests cover configuration/message target, oversized/invalid response, timeout and aborted request. These are transport checks, not email delivery to a real inbox or proof of school membership.

The local service was already part of Cuevo's Docker stack; no dependency, purchase, remote service or hosted activation was added. Mailpit v1.31.3 source/OpenAPI were read to verify supported capture and exact-message removal. Production SMTP, privacy/retention and target acceptance remain unconfigured.
