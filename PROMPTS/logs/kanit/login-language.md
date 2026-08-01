# Login Language Evidence

Date: 2026-07-31

- Root cause: The German marketing header used fixed German text while the login page honored the previously persisted `fleet_language=tr` preference.
- Fix: The German `Anmelden` link now sends `lang=de`; the login bootstrap applies supported explicit language parameters through i18next.
- Browser check: Starting with Turkish in cookie and localStorage, clicking `Anmelden` opened `/login?manual=1&lang=de`, rendered `Willkommen zurück`, and persisted `de`.
- Static checks: Changed-file ESLint, frontend TypeScript, and backend TypeScript passed.
- Backend battery: 358/358 tests passed; Codec8 normal scenario verification reported all five checks as successful; tenant isolation passed.