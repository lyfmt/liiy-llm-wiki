import { describe, expect, it } from 'vitest';

import { decodePageLocator } from '../../../src/app/api/route-helpers.js';

describe('decodePageLocator', () => {
  it('decodes taxonomy page locators', () => {
    expect(decodePageLocator('taxonomy/engineering')).toEqual(['taxonomy', 'engineering']);
    expect(decodePageLocator('taxonomy/software%20engineering')).toEqual(['taxonomy', 'software engineering']);
  });

  it('rejects unsupported page kinds', () => {
    expect(() => decodePageLocator('section/overview')).toThrow('Invalid page locator');
  });
});
