-- Persist UI absence abbreviation on manual calendar events (SU, PU, …).
ALTER TABLE "CalendarEvent" ADD COLUMN "uiStatus" TEXT;
