# Implementation plan

Phases follow the master specification (`PROJECT_SPEC.md`). Status as of 15 November 2026,
21:00 MST. Task-level detail and owners are in `TASK_QUEUE.json`.

| Phase | Scope | Status |
|---|---|---|
| 0 | Environment and scientific audit; protect the original project | **Done** |
| 1 | Public foundation: shell, design tokens, globe, layers, trend information, metadata | **Done, verified in a browser** |
| 2 | Houston flagship: inputs, footprint, exposure, timeline, synced network, context panel, reset | **Done, verified in a browser** |
| 3 | NASA deliverables: live URL, feature inventory, science explanation, references, AI disclosure, description, storyboard, video, slide outline | **Done**; the submission itself is the Team Owner's |
| 4 | Global functionality: more event sources, layers, hazard models, infrastructure, source inspection, trend comparisons | **Partly done.** Window map added. Missing: drought and wildfire models, non-U.S. infrastructure |
| 5 | Financial intelligence: commodities, securities, analogues, sensitivity ranges, portfolio, export and import | **Partly done.** Harvey analogue, portfolio screen, export and import exist. Missing: longer price history, Ike panel, any validated sensitivity range |
| 6 | Developer-only Claude research workflow | **Minimal.** Evidence report export plus `npm run research` (local `claude` CLI, output labelled unverified). No import of notes into the app |
| 7 | Final completion: validation, regression suite, cross-browser, mobile, accessibility, dashboard, recovery docs | **Partly done.** Regression suites, dashboard, recovery docs, a hindcast (which the model did not pass) and Chromium, Firefox and WebKit runs exist. Missing: a model that passes a hindcast, accessibility audit, real devices |

## Order of work from here

1. T23 and T24: rainfall or flood exposure and wind asymmetry, the two failures the hindcast exposed.
2. T06 verify the decay constants.
3. T11: ship second-opinion series so they recompute for any window.
4. T07 drought model on the existing regional series.
5. T08 wildfire footprint model.
6. T09, T10 infrastructure coverage.
7. T13–T15 financial depth, only with sourced data.
8. T16 local Claude workflow.
9. T17–T19 quality: browsers, accessibility, bundle size.

## Definition of done (from the specification) and where it stands

| # | Condition | State |
|---|---|---|
| 1 | Public site loads independently | Met (live browser tests) |
| 2 | Globe and geographic interactions work | Met |
| 3 | Environmental layers show real, labelled data | Met |
| 4 | Trend explorer is scientifically defensible | Met for the shipped scope; second opinions fixed to the full record |
| 5 | Houston simulation runs end to end | Met |
| 6 | Parameters change outputs | Met |
| 7 | Timeline updates globe and network | Met |
| 8 | Economic relationships have documented meaning | Met (qualitative) |
| 9 | Financial outputs separate evidence from hypothesis | Met |
| 10 | Unsupported forecasts withheld | Met |
| 11 | Portfolio tool performs real calculations | Met (physical exposure only) |
| 12 | Core works without public AI | Met |
| 13 | Automated tests pass | Met |
| 14 | Real-browser testing done | Met in Playwright's Chromium, Firefox and WebKit; not on real devices |
| 15 | Desktop and mobile usable | Met at a basic level; phone layout is dense |
| 16 | Public deployment verified | Met |
| 17 | Citations and licences respected | Met as far as checked; ticker table needs human review |
| 18 | Original NASA project intact | Met |
| 19 | No paid dependency | Met |
| 20 | Documentation lets another developer reproduce it | Met for build and data; NDVI regeneration is documented in the original repository |

**The platform as specified is not complete.** Hazard types beyond hurricanes, global
infrastructure, model hindcasts, the local Claude workflow and cross-browser QA remain.
