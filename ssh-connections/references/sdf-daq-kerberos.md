# SDF To DAQ Access And Kerberos

Verified on 2026-10-09 from `sdfiana025` and `psbuild-rocky9-01`.
Recheck current tickets and connectivity; recorded results are not permanent
guarantees for every host or operator account.

## Choose The Route And Account

- From sdfiana, `psbuild-rocky9-01` is reachable using Mona's SSH key.
- Direct `drp-srcf-gpu003` short-name lookup failed on sdfiana; direct SSH to
  `ued-daq` timed out. A valid Kerberos ticket does not fix DNS or routing.
- Personal-account connections to both hosts succeeded with SSH keys through
  psbuild. ProxyJump authenticates to the destination from the originating
  client; it does not use the jump host's Kerberos cache.

```bash
# From sdfiana, personal account; no Kerberos delegation needed.
ssh -o BatchMode=yes -o ConnectTimeout=10 -o GSSAPIDelegateCredentials=no \
  -J psbuild-rocky9-01 monarin@drp-srcf-gpu003 'hostname -f; id -un'
ssh -o BatchMode=yes -o ConnectTimeout=10 -o GSSAPIDelegateCredentials=no \
  -J psbuild-rocky9-01 monarin@ued-daq 'hostname -f; id -un'
```

For a hutch operator account, run the second SSH on psbuild. Verified `uedopr`
access used psbuild's local SLAC ticket and cross-realm service ticket
`host/ued-daq.pcdsn@PCDSN`:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 -o GSSAPIDelegateCredentials=no \
  monarin@psbuild-rocky9-01 \
  'ssh -o BatchMode=yes -o ConnectTimeout=10 -o GSSAPIDelegateCredentials=no uedopr@ued-daq "hostname -f; id -un"'
```

Substitute the requested hutch and authorized account, then verify that specific
route. The UED result does not establish access to every operator account.
For Mona's interactive shell, the equivalent is:

```bash
ssh -t psbuild-rocky9-01 'ssh uedopr@ued-daq'
```

A plain `-J psbuild-rocky9-01 uedopr@ued-daq` failed from sdfiana. Short-name
Kerberos lookup selected the wrong server identity; explicitly selecting
`ued-daq.pcdsn` then failed with `Cannot contact any KDC for realm 'PCDSN'`.
Use the nested SSH route rather than repeatedly renewing sdfiana's ticket.
Keep normal host-key verification and do not copy ticket files or private keys.

Mac aliases such as `psbuildrc` are not necessarily configured on SDF. Inspect
`ssh -G` and use the verified concrete host. SDF and psbuild also had different
homes (`/sdf/home/m/monarin` and `/cds/home/m/monarin`), hence different SSH keys
and shell configuration; do not assume one file edit reaches both.

## Inspect Host-Local Tickets

```bash
hostname -f
date -Is
printf 'KRB5CCNAME=%s\n' "${KRB5CCNAME-<unset>}"
klist -f
```

For remote inspection, disable delegation so the probe does not introduce
forwarded credentials that obscure the host's existing cache:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 -o GSSAPIDelegateCredentials=no \
  monarin@psbuild-rocky9-01 'hostname -f; date -Is; klist -f'
```

Both hosts had principal `monarin@SLAC.STANFORD.EDU` and default cache path
`FILE:/tmp/krb5cc_12682`, but these are distinct host-local files. Renewing one
does not renew the other. `KRB5CCNAME` can select a different cache per session.
Inspect the `krbtgt/SLAC.STANFORD.EDU@SLAC.STANFORD.EDU` row:

- `Expires` is the current validity deadline (shown in the host's timezone).
- `R` in flags means renewable; `renew until` is the final renewal limit.
- `F` means forwardable, not renewable. The initial sdfiana ticket had `FRIA`;
  psbuild had `FIA`, despite both being valid for about 25 hours.
- Renewability permits password-free `kinit -R` before expiry. It does not
  renew automatically or make a seven-day renewal window a seven-day ticket.
- After expiry, or once the renewal limit is reached, obtain a fresh ticket.
  The KDC controls the maximum ticket and renewal lifetimes.

## The krb Helper

Mona added this function to `~/goodstuffs/bashrc` on SDF:

```bash
krb() {
    command kinit -R 2>/dev/null ||
        command kinit -r 7d monarin@SLAC.STANFORD.EDU ||
        return
    command klist -f
}
```

Use the same behavior on either host; hostname branching is unnecessary.
Run it on the host needing credentials. Check `type krb` in Mona's interactive
shell; a separate psbuild home may need its own goodstuffs update. A new shell
loads the helper, or Mona can source `~/goodstuffs/bashrc` in an existing shell.
Do not source an entire interactive bashrc just to run an agent's read-only probe.

For status-only tasks, inspect without renewing. When credential repair is part
of the task, an agent can attempt noninteractive `kinit -R` on the required host.
If a new ticket is necessary, have Mona run `krb` or
`kinit -r 7d monarin@SLAC.STANFORD.EDU` in her own terminal; do not collect her
password or run a password-prompting fallback in unattended automation.
Mac S3DF key registration, SSH public keys, and Kerberos tickets are separate
credentials; renew the one needed for the failing operation.

References: [MIT kinit](https://web.mit.edu/kerberos/krb5-latest/doc/user/user_commands/kinit.html)
and [OpenSSH ProxyJump](https://man.openbsd.org/ssh_config#ProxyJump).
