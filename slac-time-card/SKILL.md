---
name: slac-time-card
description: Fill Mona's SLAC Sequoia time cards from the saved FY27 project-allocation guide, preserving absences and stopping before submission. Use for Sequoia time-card entry, review, correction, or preparation for a specified pay period.
---

# SLAC Time Card

Use this skill for Mona's SLAC time cards in Sequoia.

## Baseline allocation

Before entering project effort, inspect [assets/Timesheet_Guide_FY27.png](assets/Timesheet_Guide_FY27.png) and use the column for the requested month. Treat this guide as the baseline; apply any adjustment Mona gives in the current request instead.

The guide expresses effort as fractions summing to `1.00`, while Sequoia's `Regular Percent` quantity expects whole percentages. For example, enter `30`, not `0.30`.

## Scope and authorization

- Work only on the pay period Mona explicitly requests or the requested period already open in Chrome. A month name does not authorize creating or filling an adjacent semimonthly period.
- Preserve existing absence rows and other user-entered data unless Mona asks to change them.
- Saving the requested entries is part of filling the card unless Mona says not to save.
- Never click `Submit` without Mona's explicit request and the required action-time confirmation immediately before submission.

## Entry rules

1. Confirm the displayed time-card period before editing.
2. Use assignment `E05766143` and time type `Regular Percent` for project-allocation rows.
3. Select each nonzero SLAC PA from the guide. Do not create a row for a zero allocation.
4. Enter the whole percentage on each normal working weekday in the requested period.
5. Leave weekends and nonworking days blank.
6. If an existing absence row records a full-day absence, leave every `Regular Percent` project cell blank on that date. Do not alter the absence row.
7. Save and use Sequoia's validation messages as authoritative. Correct any reported date totals or absence conflicts, then save again.

## Verification

Before finishing, verify that:

- every populated normal workday totals `100` across project rows;
- full-day absence dates have no `Regular Percent` quantity;
- the header shows the intended pay period and `Saved` status;
- the card remains unsubmitted unless Mona explicitly completed the submission confirmation.

Keep the saved card open in Chrome for Mona to review and report the period filled, any preserved absences, and that it was not submitted.
