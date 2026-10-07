-- CreateTable
CREATE TABLE "StundNasLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "StundNasLink_token_key" ON "StundNasLink"("token");

