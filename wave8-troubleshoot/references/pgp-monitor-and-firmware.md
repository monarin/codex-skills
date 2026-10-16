# Wave8 PGP Monitor And KCU Firmware

## Recorded Software Selection (2026-10-16)

- Mona used `source ~tmoopr/daq/scripts/setup_env.sh`, selecting
  `daq_20250402_r9`, with reported Rogue/PyRogue **6.1.3**. Setup scripts can
  change; verify imports in the launch shell.
- Repository: [slaclab/pgp-pcie-apps](https://github.com/slaclab/pgp-pcie-apps).
- Mona chose cpo's working checkout at
  **`ac36573ea8bf42556869346f5b79389c96dfcb19`**, rather than a release tag.
- It includes `7d440848f3c80be6cba1357deaf91047ff04be8a`, “upgrading to rogue v6”.
  No tag points directly to the fix; `v2.6.0` is the earliest containing release
  in the inspected tag set. `v2.5.0` lacks it.
- Recorded submodules at the chosen commit:

| Submodule | Commit |
| --- | --- |
| axi-pcie-core | `e6d5f785a7ad1ded92f0906e59f6edebad0eb3b7` |
| ruckus | `db3e562fad12f501b649684001919d4aa3b68de6` |
| surf | `ce66ccf99b8f265acfe7947aeb83c9dea1b26640` |

Mona reported cpo's checkout worked on hardware. The replacement
`~/pgp-pcie-apps` matched his monitor byte-for-byte, passed syntax/API checks,
and had clean/pinned submodules. It was not launched against hardware during
verification. These commits describe software, not firmware loaded on a card.

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
are needed. cpo's five-second root timeout is separate from the keyword error.
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
git checkout --detach ac36573ea8bf42556869346f5b79389c96dfcb19
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
removes downloaded objects nor shrinks ordinary Git history. The replacement
measured **559 MiB old / 563 MiB new**, with about 504 MiB in `.git` and no
downloaded LFS objects. Do not promise space savings. Obtain required firmware
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

Its parser supports `--path`, `--package`, and `--dev`; PCIe rescan defaults to
enabled and may require root. Inspect source and the deployment procedure before
proposing a programming command. Firmware programming/reload and PCIe rescan
can interrupt acquisition and require operation-specific authorization.
No firmware was programmed or checked on the card in this investigation.
