# Read-Only ConfigDB Without Unnecessary Kerberos

Identify the database and failing operation first: DAQ ConfigDB, psana calibration
DB, and SSH operator login have different authentication paths. An SSH route
through psbuild does not itself fix a database HTTP authentication failure.

## ConfigDB Read Endpoint

The checkout inspected on 2026-10-09 supports unauthenticated inspection at:

```text
https://pswww.slac.stanford.edu/ws/configdb/ws/
```

In `psdaq/psdaq/configdb/configdb.py`, `_cat()` and `_ls()` explicitly replace
`ws-auth` and `ws-kerb` with `ws` because those reads do not require authentication.
`_get_response()` uses HTTP Basic auth for `ws-auth`, Kerberos headers for
`ws-kerb`, and no authentication for the plain `ws` endpoint. Follow this existing
read interface rather than requesting a ticket or operator password unnecessarily.

For an existing query URL, change only that authentication path component;
preserve the server, production/development database (`configdb` versus
`devconfigdb`), root, hutch, alias/key, and detector segment. Use a separate
inspection client with `create=False`; do not edit live DAQ settings.

```python
from psdaq.configdb.configdb import configdb

db = configdb(
    "https://pswww.slac.stanford.edu/ws/configdb/ws/",
    "ued", create=False, root="configDB",
)
aliases = db.get_aliases()
# Once the requested alias and exact device/segment are known:
# cfg = db.get_configuration(alias, device)
```

Verified from sdfiana on 2026-10-09: the following unauthenticated request returned
HTTP 200 with JSON `success: true`:

```bash
curl -q --fail --silent --show-error --max-time 15 \
  https://pswww.slac.stanford.edu/ws/configdb/ws/configDB/get_hutches/
```

Check both HTTP status and the API's success field. A successful hutch listing
does not establish that a requested alias/device exists. ConfigDB also implements
some mutating operations using HTTP GET, so GET alone is not proof of read-only
behavior: stick to listing/retrieval methods, never create/modify/remove/rename
operations for inspection.

## Failure Diagnosis And Boundaries

- Check the selected URL and imported module's `__file__` before changing code;
  an installed release may differ from `~/lcls2`.
- DNS errors, timeouts, client-side Kerberos exceptions, HTTP 401/403, and
  missing records are different failures. Inspect the actual result.
- If a protected endpoint genuinely requires authentication, use its supported
  credentials. Do not disable TLS checking or invent authentication headers.
- Do not print `CONFIGDB_AUTH`, passwords, JWTs, or Kerberos headers while debugging.
- For psana calibration reads, use the `psana` skill's
  [calibration read guidance](../../psana/references/user-facing.md#read-only-calibration-database-access):
  the normal public endpoint is `https://pswww.slac.stanford.edu/ws/calib_ws/`.
- For operator SSH failures, use the `ssh-connections` skill's
  [DAQ access reference](../../ssh-connections/references/sdf-daq-kerberos.md).
