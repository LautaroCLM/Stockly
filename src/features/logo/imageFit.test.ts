import { describe, expect, it } from 'vitest';
import { fitWithin, isSupportedLogoType } from './imageFit';

describe('fitWithin', () => {
  it('reduce una imagen grande conservando las proporciones', () => {
    expect(fitWithin(2048, 1024)).toEqual({ width: 512, height: 256 });
    expect(fitWithin(1000, 1000)).toEqual({ width: 512, height: 512 });
  });
  it('no agranda una imagen chica', () => {
    expect(fitWithin(200, 100)).toEqual({ width: 200, height: 100 });
  });
  it('nunca devuelve un lado en cero', () => {
    expect(fitWithin(4000, 2).height).toBeGreaterThanOrEqual(1);
  });
});

describe('isSupportedLogoType', () => {
  it('acepta PNG, JPG y WebP, y rechaza el resto', () => {
    expect(isSupportedLogoType('image/png')).toBe(true);
    expect(isSupportedLogoType('image/svg+xml')).toBe(false);
    expect(isSupportedLogoType('application/pdf')).toBe(false);
  });
});
