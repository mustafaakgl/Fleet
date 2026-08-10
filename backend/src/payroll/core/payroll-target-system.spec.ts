import assert from 'node:assert/strict';
import { PayrollTargetSystem } from '@prisma/client';
import { describe, it } from 'node:test';
import { providerOf, requiresDatevMandant } from './payroll-target-system';

describe('providerOf', () => {
  it('maps every target system to a provider', () => {
    // Enum'a yeni bir urun eklenip burasi unutulursa `providerOf` undefined
    // dondururdu ve hazirlik kontrolu sessizce DATEV kosullarini atlardi.
    for (const targetSystem of Object.values(PayrollTargetSystem)) {
      assert.ok(
        providerOf(targetSystem) === 'datev' || providerOf(targetSystem) === 'lexware',
        `${targetSystem} has no provider`,
      );
    }
  });

  it('keeps the two DATEV products on the DATEV provider', () => {
    assert.equal(providerOf('datev_lodas'), 'datev');
    assert.equal(providerOf('datev_lohn_und_gehalt'), 'datev');
  });

  it('puts Lexware on its own provider', () => {
    assert.equal(providerOf('lexware_lohn_und_gehalt'), 'lexware');
  });
});

describe('requiresDatevMandant', () => {
  it('asks for Berater/Mandant only on DATEV targets', () => {
    assert.equal(requiresDatevMandant('datev_lodas'), true);
    assert.equal(requiresDatevMandant('datev_lohn_und_gehalt'), true);
    // Lexware'de boyle bir kimlik yok; istemek donemi kalici olarak bloklardi.
    assert.equal(requiresDatevMandant('lexware_lohn_und_gehalt'), false);
  });
});
