# UED test bundle and production promotion

Mona's explicit preference, 2026-09-28: after successful UED module tests,
commit the validated ePix submodule pointer and any necessary patch-recipe
changes back to `slac-lcls/lcls2_submodules`, so others can reproduce the
working bundle. Do not consider a private directory alone a finished release.

## Current test candidate

- Private SDF path: `/sdf/home/m/monarin/lcls2_submodules_09282026_ued_epixquad_test1`.
- Superproject branch: `ued-epixquad-20260928`; baseline
  `f42780c93414182c652c620eaeb861bcf1b99333`.
- ePix pin: `44a7c1cb9ed1869e75b16e24bb610e7e3ee53698`, containing PRs 19/20/21.
- Keep PCIe apps at `ccbe3de52fa7f6c09dac0216372121bcfbbc49e5` and retain
  recorded nested dependencies. Changing bundles does not select timing modes
  or authorize hardware register/firmware/ADC-training operations.
- Construction/validation notes live in Mona's
  `lcls2_worktree/ued-epix10ka-rdsrv421-daq/psdaq/psdaq/debugtools/epixquad1kfps/`.
  Read `UED_SUBMODULE_BUNDLE_PLAN.md` and the preparation result before resuming.
  Preparation and software checks are not production hardware acceptance.

## Reproducibility and naming

The observed SDF release-directory convention is `lcls2_submodules_MMDDYYYY`.
The date identifies the deployed directory, not a Git tag or source revision.
`_ued_epixquad_test1` is our private candidate suffix, not a site standard.
An older `/cds` reference uses a different date format; don't generalize it.

The superproject commit plus its tracked `patch.sh` recipe pins the bundle.
Initialize with `git submodule update --init --recursive`, not `--remote`.
Record recursive gitlink SHAs, applied patches/checksums, actual import paths,
Conda/Python/Rogue versions, and validation results. The site's patch recipe
includes bypassing a Rogue 6.4 version guard for the Rogue 6.1.3 environment;
a bare recursive clone is not equivalent to that deployed software.

## After tests pass

1. Check the UED FP/FN and standalone acquisition results against the agreed
   test plan and record hardware/firmware, software versions, and limitations.
2. Prepare an upstream superproject PR with the tested ePix gitlink and only
   necessary recipe changes; include the results and exact environment.
3. Promote those same versions into a fresh dated production bundle through
   the release maintainer workflow. Don't pull unrelated newer dependencies
   during promotion; review and retest differences if any are required.
4. Record the merged superproject SHA in deployment notes. A tag is optional;
   no tag convention existed when investigated on 2026-09-28.
5. Select the new bundle via `SUBMODULEDIR`, verify UED operation, and retain
   the previous bundle for rollback. Other detectors need their own adoption
   checks; UED success alone doesn't validate all 14 repositories.

Mona authorized test-bundle preparation and asked that this follow-up be
remembered. This preference does not itself authorize future production
switches, publishing/merging, or messages to maintainers.
