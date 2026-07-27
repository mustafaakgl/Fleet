-- Make assignment start/end times optional (all-day assignments)
ALTER TABLE "Assignment" ALTER COLUMN "startTime" DROP NOT NULL;
ALTER TABLE "Assignment" ALTER COLUMN "endTime" DROP NOT NULL;
