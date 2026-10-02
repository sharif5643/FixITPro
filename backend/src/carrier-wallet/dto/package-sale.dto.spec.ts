import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { PackageSaleDto } from './package-sale.dto';

// Mirrors the global pipe in main.ts
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
const validate = (body: object) =>
  pipe.transform(body, { type: 'body', metatype: PackageSaleDto });

const body = { carrier: 'AIS', packageAmount: 250, paymentMethod: 'CASH', amountPaid: 250, cashierName: 'Test' };

describe('PackageSaleDto validation', () => {
  it('accepts saleType and dealerCost sent by the web package-sales page', async () => {
    const dto = await validate({ ...body, saleType: 'PROMO', dealerCost: 242.5 });
    expect(dto).toMatchObject({ saleType: 'PROMO', dealerCost: 242.5 });
  });

  it('accepts a request without saleType or dealerCost (SUNMI sim-sales page)', async () => {
    await expect(validate(body)).resolves.toMatchObject(body);
  });

  it('rejects SIM_SALE — that type must use /carrier-wallet/sim-sale', async () => {
    await expect(validate({ ...body, saleType: 'SIM_SALE' })).rejects.toThrow(BadRequestException);
  });

  it('rejects negative dealerCost', async () => {
    await expect(validate({ ...body, dealerCost: -1 })).rejects.toThrow(BadRequestException);
  });
});
