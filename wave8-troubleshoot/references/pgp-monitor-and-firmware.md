# Wave8 PGP Monitor And KCU Firmware

## Preferred Hardware-Tested Software (2026-10-16)

- Mona used `source ~tmoopr/daq/scripts/setup_env.sh`, selecting
  `daq_20250402_r9`, with reported Rogue/PyRogue **6.1.3**. Setup scripts can
  change; verify imports in the launch shell.
- Repository: [slaclab/pgp-pcie-apps](https://github.com/slaclab/pgp-pcie-apps).
- Mona tested and chose **`7d440848f3c80be6cba1357deaf91047ff04be8a`**,
  “upgrading to rogue v6”, described by Git as **`v2.5.0-9-g7d44084`**.
  Keep this version and its pinned submodules for this deployment; do not
  automatically advance to cpo's newer checkout or a newer release.
  No tag points directly to the fix; `v2.6.0` is the earliest containing release
  in the inspected tag set. `v2.5.0` lacks it.
- Recorded submodules at the chosen commit:

| Submodule | Commit |
| --- | --- |
| axi-pcie-core | `2b99fccc0152fe222b7657c316ebb025fe9811f6` (`v4.0.1`) |
| ruckus | `d9d27b430b027a586ebacbd497ce8fa5939d8694` (`4.11.0-4-gd9d27b4`) |
| surf | `6995288721d022a8525448e7cc240ae8f638a0be` (`v2.47.2`) |

After switching `~/pgp-pcie-apps` and updating its submodules, syntax/API checks
passed and the working tree was clean. Mona then ran the monitor on the hardware
and confirmed it works. This is operator-confirmed monitor operation, not a
claim that every DAQ mode or firmware combination was tested.

The earlier comparison used cpo's `ac36573` (`v3.4.0-7-gac36573`). That checkout
is superseded by the tested choice above so the software stays closer to the
installed firmware while retaining the Rogue 6 fix.

Read-only `cat /proc/datadev_0` on `drp-srcf-cmp004` reported:

| Field | Observed value |
| --- | --- |
| Firmware version | `0x2050000` (v2.5.0) |
| Firmware Git hash | `3e991ffef660bd16cc1789b8c89418698521d62f`, exactly tagged `v2.5.0` |
| Build target | `XilinxKcu1500Pgp4_6Gbps` |
| Build date | 2024-02-15, Vivado v2023.1 |
| PCIe address | `0000:41:00.0` |

The selected software is nine commits after the installed firmware's source
revision. These are separate software and firmware versions; no firmware update
was performed. Re-read `/proc/datadev_0` when diagnosing a later deployment.

## Launch On The Wave8 Data Node

Run from `software/` on the node receiving Wave8 PGP data, with a suitable GUI
display/session and permission to access the card:

```bash
source ~tmoopr/daq/scripts/setup_env.sh
cd ~/pgp-pcie-apps/software
python scripts/PgpMonitor.py --dev /dev/datadev_0 --numLane 8 --boardType XilinxKcu1500 --pollEn 1
```

The reported node was `drp-srcf-cmp004`. Confirm the current node/device from DAQ
config/logs. Eight monitor lanes need not all belong to the same hutch.

## Rogue 6 API Mismatch

Failure in the v2.5.0 checkout:

```text
TypeError: runPyDM() got an unexpected keyword argument 'root'
```

Installed Rogue 6.1.3 has `runPyDM(serverList=..., ...)`, not `root=`. The fixed
script creates and registers a server after initializing the Root:

```python
self.zmqServer = pyrogue.interfaces.ZmqServer(root=self, addr='127.0.0.1', port=0)
self.addInterface(self.zmqServer)
```

It calls `pyrogue.pydm.runPyDM(serverList=root.zmqServer.address)`. Both changes
are needed. The five-second root timeout in cpo's newer checkout is separate
from the keyword error and is not part of the selected `7d44084` monitor.
Inspect the actual imported API without opening a device:

```bash
python - <<'PY'
import inspect
import pyrogue
import pyrogue.pydm
print(pyrogue.__file__)
print(inspect.signature(pyrogue.pydm.runPyDM))
PY
```

Historical notes mention Rogue 5 in `ps-4.6.1` and Rogue 6 in `ps-4.6.3` as of
2024-06-06. Do not turn those names into present requirements; the script
revision and imported API determine compatibility.

## Clone With LFS Downloads Skipped

For a new destination (do not overwrite local work):

```bash
export GIT_LFS_SKIP_SMUDGE=1
git clone --recursive https://github.com/slaclab/pgp-pcie-apps.git ~/pgp-pcie-apps
cd ~/pgp-pcie-apps
git checkout --detach 7d440848f3c80be6cba1357deaf91047ff04be8a
git submodule sync --recursive
git submodule update --init --recursive
git status --short
git submodule status --recursive
```

Some revisions use SSH submodule URLs. If needed, use command-local
`-c url.https://github.com/.insteadOf=git@github.com:` for clone/update instead of
changing global Git configuration. Git LFS must be available when configured as
a required filter. On the inspected SDF environment it was in the DAQ conda
environment's `bin`, but not the default shell PATH.

`GIT_LFS_SKIP_SMUDGE=1` leaves LFS pointers in place during checkout. It neither
removes downloaded objects nor shrinks ordinary Git history. The initial
replacement at `ac36573` measured **559 MiB old / 563 MiB new**, with about
504 MiB in `.git` and no downloaded LFS objects; that measurement preceded the
switch to `7d44084`. Do not promise space savings. Obtain required firmware
images separately; an LFS pointer is not an image.

## Firmware Is Separate From GUI Compatibility

Mona's supplied FIM/Wave8 notes require at least the KCU firmware associated
with `pgp-pcie-apps v1.5.0` for eight FIMs on one compute node. This is a
historical firmware minimum, not the Rogue 6 monitor requirement. Verify the
loaded firmware identity/version and hardware before selecting an image from
[pgp-pcie-apps releases](https://github.com/slaclab/pgp-pcie-apps/releases).

Historical instructions used `python scripts/updatePcieFpga.py --path
<PATH TO FIRMWARE DIR>` from `pgp-pcie-apps`. That path does not exist at the
chosen commit. The inspected updater is:

```text
firmware/submodules/axi-pcie-core/scripts/updatePcieFpga
```

At the selected submodule revision its parser supports `--path`, `--package`,
and `--dev`; it does not have the newer updater's `--rescan` option. Inspect
source and the deployment procedure before proposing a programming command.
Firmware programming/reload and any separate PCIe rescan can interrupt
acquisition and require operation-specific authorization. Firmware identity was
read from `/proc/datadev_0`; no firmware was programmed in this investigation.
