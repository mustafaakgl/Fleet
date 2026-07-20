import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDriverDto } from './create-driver.dto';

const validInput = {
  first_name: 'QA',
  last_name: 'Driver',
  license_number: 'QA-API-12345',
  license_expiry_date: '2030-01-01',
};

describe('CreateDriverDto date boundaries', () => {
  it('accepts a future license expiry date', async () => {
    const dto = plainToInstance(CreateDriverDto, validInput);
    const errors = await validate(dto);

    assert.equal(errors.length, 0);
    assert.ok(dto.license_expiry_date instanceof Date);
  });

  it('rejects an expired license date', async () => {
    const dto = plainToInstance(CreateDriverDto, {
      ...validInput,
      license_expiry_date: '2000-01-01',
    });
    const errors = await validate(dto);

    assert.ok(errors.some((error) => error.property === 'license_expiry_date'));
  });
});