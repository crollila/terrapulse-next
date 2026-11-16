# Local Claude-assisted research (developer only)

The public site uses no AI. This workflow runs only on the developer's computer with the
developer's own Claude Code sign-in. No endpoint is published and no credential is stored in the
repository or shipped to the site.

## What it does

1. In the simulator, press **Evidence report**. The browser writes
   `terrapulse-scenario-report-*.md`: every computed figure with its evidence class and source, the
   relationships used, what was not estimated, the method and the re-importable parameters. This
   file is produced by deterministic code, not by a model.
2. Run:

   ```bash
   npm run research -- path/to/terrapulse-scenario-report-cat5.md
   ```

   The script sends the report to the local `claude` CLI with rules that forbid adding numbers,
   estimating prices or calling the scenario a forecast, and asks for a summary, the main
   exposures, the report's blind spots, research questions and model improvements.
3. The answer is saved to `research/notes/…-note-<time>.md` under a header that marks it
   **AI-drafted, not verified**. The folder is git-ignored so drafts are not published by accident.

If the `claude` CLI is missing, the prompt is saved as a `.prompt.txt` to paste into a Claude Code
session. If usage is unavailable the script says so and saves nothing.

## Conditions

- This computer is on and the `claude` CLI is signed in.
- Included subscription usage is available. The script does not enable paid credits and does not
  retry around limits.

## Other local helpers

- `npm run resume`: prints the next task from `TASK_QUEUE.json` and a prompt to continue the build.
- `npm run dashboard`: local engineering dashboard (`http://localhost:4600`).
- `npm run status`: measured project status.

## What is not built

- Importing a research note back into the app as a labelled panel.
- Historical-analogue research and validation assistance beyond the prompt above.
