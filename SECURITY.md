# Security Policy

Family Credits is a local-first household prototype. It is not hardened for internet-facing production use.

## Supported Use

- Run it on a trusted local machine or private network.
- Keep `db.json` private. It contains household names, balances, transactions, password hashes, and other family ledger data.
- Use environment variables for provider API keys when possible, or paste a key into the UI only for a one-off AI suggestion.

## Reporting Issues

Please open a private security advisory on GitHub if this repository is public and advisories are enabled. Otherwise, contact the maintainer privately before sharing sensitive details.

## Important Limitations

- Password hashing uses a fixed prototype salt and is intended for local demos only.
- Sessions are in memory and reset when the Python process restarts.
- The built-in Python server is a development server, not a production deployment target.
