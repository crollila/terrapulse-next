# Blockers and open risks

Updated 2026-11-15 21:00 MST.

## Needs the Team Owner

1. **NASA submission (deadline 23:59 MST, 15 November 2026).** No evidence that the project has
   been submitted. The demo link and the "Submit for Judging" button need a person with the team
   account. Kit: `docs/NASA_SUBMISSION_KIT.md`.
2. **SI (AI) disclosure accuracy.** If the extension is mentioned in the submission, the SI
   statement must cover it. Only the team can say how the idea developed.
3. **Review of the ticker mapping** in `src/data/companies.ts` (parent company → U.S. listing). It
   is an identifier table written from general knowledge of public listings, checked only for
   consistency with the EIA file. A person should confirm it before relying on the portfolio screen.

## Technical, not yet resolved

| Item | Why it is open | Effect |
|---|---|---|
| Inland decay constants (0.095 per hour, 26.7 kt) | Two attempts failed: AMS returned 403, AOML timed out; the abstract, the 2007 JHT report and the 2005 SHIPS paper do not state them | Shown as assumptions; rate is adjustable |
| Hurricane model failed its Harvey hindcast and is inconclusive on Ike | Wind-only, symmetric profile; flood-driven shutdowns are outside the model (`research/HINDCAST.md`) | Model stays EXPERIMENTAL; the app says so in the model card, the simulator panel and the markets view |
| Equity price history | No verified redistributable source | "Insufficient validated data" shown |
| Second opinions fixed to the full record | GPCP and GISTEMP series not shipped | Stated in the explorer |
| Tested in Playwright's Chromium, Firefox and WebKit builds only | No real Safari, no real phones, no screen reader | Unknown behaviour there |
| OpenFreeMap is a third-party free service | No SLA | Falls back to bundled outlines without labels |
| Infrastructure is U.S. only | No verified global dataset yet | Regions outside the U.S. show "Insufficient validated data" |
| Six EIA refineries lack coordinates | Not in the 2021 map layer | Excluded and listed in the data file |

## Not blockers, but conditions for autonomous work

- Work continues only while this computer is on, a Claude Code session is open and included usage
  is available. Nothing runs in the cloud on a schedule.
- No paid service, credit card or usage credit has been enabled, and none is needed.
