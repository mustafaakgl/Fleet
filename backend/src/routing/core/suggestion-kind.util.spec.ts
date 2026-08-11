import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifySuggestionKind } from './suggestion-kind.util';

describe('classifySuggestionKind', () => {
  it('treats a German house address as an address', () => {
    // Asil hata buydu: place/house taninmiyordu, POI sayilip eleniyordu ve
    // kullanici "Buttmannstrasse 2" yazinca numarali adres listeden dusuyordu.
    assert.equal(classifySuggestionKind('place', 'house'), 'address');
    assert.equal(classifySuggestionKind('place', 'houses'), 'address');
  });

  it('still recognises settlements as cities', () => {
    for (const value of ['city', 'town', 'village', 'suburb']) {
      assert.equal(classifySuggestionKind('place', value), 'city');
    }
  });

  it('keeps other place values out of the address list', () => {
    // place/sea, place/island gibi degerler adres degildir.
    assert.equal(classifySuggestionKind('place', 'island'), 'poi');
  });

  it('recognises street lines and buildings', () => {
    assert.equal(classifySuggestionKind('highway', 'residential'), 'street');
    assert.equal(classifySuggestionKind('building', 'warehouse'), 'address');
  });

  it('rejects businesses that merely sit at an address', () => {
    // office/insurance de ayni sokak+numarayi tasiyor ama adres kaydi degil,
    // isletmedir; adres listesinde gorunmesi gurultu olurdu.
    assert.equal(classifySuggestionKind('office', 'insurance'), 'poi');
    assert.equal(classifySuggestionKind('amenity', 'restaurant'), 'poi');
    assert.equal(classifySuggestionKind('shop', 'supermarket'), 'poi');
  });

  it('falls back to poi for unknown input', () => {
    assert.equal(classifySuggestionKind(undefined, undefined), 'poi');
  });
});
