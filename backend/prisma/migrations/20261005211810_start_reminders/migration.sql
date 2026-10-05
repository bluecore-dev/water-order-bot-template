-- Start reminders replace the single "never ordered" reminder.
ALTER TABLE "User" DROP COLUMN "reminderSentAt",
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "startReminders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "engagedAfterStart" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "User_startedAt_idx" ON "User"("startedAt");
