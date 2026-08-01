# Dashboard Einsatzplan Button Evidence

Date: 2026-07-31

- Office and boss dashboards no longer render the daily Einsatzplan preview table.
- Each dashboard renders only the localized `Einsatzplan öffnen` button and preserves its existing role-specific deep link.
- Changed-file ESLint and frontend TypeScript passed.
- Backend TypeScript and 358/358 tests passed.
- Codec8 normal scenario verification passed all five checks; tenant isolation passed.
- Browser rendering could not be authenticated because the shared browser had no active session; the local dev server remained available.