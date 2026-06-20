# Family Credits

Family Credits is a local-first household chore and allowance system. It helps parents and children coordinate chores, earn rewards, track savings, and keep the daily family routine visible in one place.

The backend is a single Python standard-library server in `app.py`. The frontend is plain HTML, CSS, and JavaScript in `public/`.

## What v1 is

- Chores with clear payouts and parent approval
- Allowance and reward tracking
- Savings balances and simple household goals
- Parent and child portals with separate login flows

## What v1 is not

- A general family OS
- A finance app for adults
- A social network
- A crypto or DAO product
- A kitchen sink of every household feature

## Features

- Chore bounty board with daily presets, deadlines, and parent approvals
- Family Credits ledger for earnings, spending, savings, loans, and adjustments
- Reward shop with stock and affordability checks
- Family fund contributions and progress tracking
- Personal reminders and appreciation checkpoints
- Reports for earning, spending, saving, and contribution patterns
- Command center, command palette, shop filters, and ledger filters
- Optional AI helper for suggesting fair Family Credit amounts

## Requirements

- Python 3.12 or newer
- A modern browser
- Optional: [`uv`](https://github.com/astral-sh/uv) for the documented run command

No Python package install is required; the app uses only the Python standard library.

## Quick Start

```powershell
uv --cache-dir .uv-cache run python app.py
```

If you are not using `uv`:

```powershell
python app.py
```

Then open:

```text
http://127.0.0.1:3000/login
```

## Default Prototype Passwords

- Parent: `parent123`
- Alice: `alice123`
- Bob: `bob123`

These defaults are for local prototyping only. Change passwords before using real household data.

## Local Data

The app stores its local ledger in `db.json`. That file is intentionally ignored by Git because it can contain household names, balances, transactions, password hashes, and other private data.

If `db.json` does not exist, the server creates a fresh prototype database on startup.

To reset the local app, stop the server and remove `db.json`.

## Configuration

The app reads optional settings from environment variables:

```text
PORT=3000
OPENAI_API_KEY=
OPENROUTER_API_KEY=
GOOGLE_API_KEY=
GEMINI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENROUTER_MODEL=openai/gpt-4o-mini
GOOGLE_MODEL=gemini-2.0-flash
```

Copy `.env.example` for reference. The app does not load `.env` files by itself, so set variables in your shell or hosting environment.

For one-off AI suggestions, you can paste an API key directly into the UI. The key is sent only for that request and is not saved by the frontend.

## Repository Hygiene

Before publishing or opening a pull request, verify:

```powershell
python -m py_compile app.py
node --check public/app.js
node --check public/login.js
node --check public/selects.js
```

The GitHub Actions workflow in `.github/workflows/ci.yml` runs these checks on pushes and pull requests.

## Security Notes

Family Credits is designed as a local prototype, not an internet-facing production service. See `SECURITY.md` before using it with sensitive data.

## License

No license has been selected yet. Add a license before accepting outside contributions or publishing this as reusable open-source software.
