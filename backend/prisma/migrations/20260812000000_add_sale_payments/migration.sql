-- CreateTable
CREATE TABLE "SalePayment" (
    "id"            TEXT NOT NULL,
    "saleId"        TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "amount"        DECIMAL(10,2) NOT NULL,
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalePayment_saleId_idx" ON "SalePayment"("saleId");

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "Sale"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
