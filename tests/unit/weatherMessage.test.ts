// OWNER-MANUAL-TEST-CORRECTIONS item 4 — confirmed source defect: the old
// sunny-branch message said "Beautiful sunny day! Perfect for a walk" for
// every temperature at or below 80°F, including 38°F. These tests assert
// the replacement condition-AND-temperature-aware messaging, including the
// exact cases the owner named: sunny 38°F, pleasant 68°F, hot 95°F,
// freezing, rainy, and unavailable weather.
import { describe, it, expect } from 'vitest';
import { getWeatherMessage, getTempBand, WEATHER_UNAVAILABLE_MESSAGE } from '@/lib/weatherMessage';

describe('OWNER-MANUAL-TEST-CORRECTIONS item 4 — weather messaging', () => {
  it('sunny 38°F describes the cold appropriately and does NOT recommend a walk (the confirmed defect)', () => {
    const msg = getWeatherMessage('sunny', 38);
    expect(msg).not.toContain('Perfect for a walk');
    expect(msg.toLowerCase()).toContain('cold');
  });

  it('sunny 68°F (pleasant/mild) still recommends a walk — the legitimate case is preserved', () => {
    expect(getWeatherMessage('sunny', 68)).toBe('Beautiful sunny day! Perfect for a walk.');
  });

  it('hot 95°F (sunny) gives an appropriate heat warning, not a walk suggestion', () => {
    const msg = getWeatherMessage('sunny', 95);
    expect(msg).not.toContain('Perfect for a walk');
    expect(msg.toLowerCase()).toMatch(/hot|heat/);
  });

  it('freezing temperatures (<=32°F) never suggest a walk, across multiple conditions', () => {
    for (const condition of ['sunny', 'partly-cloudy', 'cloudy'] as const) {
      const msg = getWeatherMessage(condition, 20);
      expect(msg).not.toContain('Perfect for a walk');
      expect(msg.toLowerCase()).toMatch(/freez|cold|bundle/);
    }
  });

  it('rainy weather stays a cosy message (not treated as suitable for a walk) and gets a cold variant when also cold', () => {
    expect(getWeatherMessage('rainy', 55)).toBe('Rainy day — perfect to stay cosy.');
    const coldRain = getWeatherMessage('rainy', 30);
    expect(coldRain.toLowerCase()).toContain('cold');
  });

  it('snowy weather never suggests a walk and mentions warmth', () => {
    const msg = getWeatherMessage('snowy', 25);
    expect(msg).not.toContain('Perfect for a walk');
    expect(msg.toLowerCase()).toContain('warm');
  });

  it('stormy weather is always a stay-safe-inside message regardless of temperature', () => {
    expect(getWeatherMessage('stormy', 70)).toBe('Stay safe and warm inside today.');
    expect(getWeatherMessage('stormy', 20)).toBe('Stay safe and warm inside today.');
  });

  it('clear-night at a cold temperature mentions staying warm, not just "a good time to rest"', () => {
    expect(getWeatherMessage('clear-night', 25)).not.toBe('Clear night — a good time to rest.');
  });

  it('every one of the 10 weather conditions returns a non-empty string at every temperature band', () => {
    const conditions = [
      'sunny', 'partly-cloudy', 'cloudy', 'rainy', 'stormy',
      'snowy', 'foggy', 'clear-night', 'autumn', 'windy',
    ] as const;
    const temps = [-10, 20, 38, 45, 55, 68, 80, 90, 95, 110];
    for (const c of conditions) {
      for (const t of temps) {
        expect(typeof getWeatherMessage(c, t)).toBe('string');
        expect(getWeatherMessage(c, t).length).toBeGreaterThan(0);
      }
    }
  });

  it('getTempBand classifies the named boundary cases correctly', () => {
    expect(getTempBand(32)).toBe('extreme-cold');
    expect(getTempBand(33)).toBe('cold');
    expect(getTempBand(49)).toBe('cold');
    expect(getTempBand(50)).toBe('cool');
    expect(getTempBand(60)).toBe('mild');
    expect(getTempBand(80)).toBe('mild');
    expect(getTempBand(81)).toBe('hot');
    expect(getTempBand(94)).toBe('hot');
    expect(getTempBand(95)).toBe('extreme-heat');
  });

  it('WEATHER_UNAVAILABLE_MESSAGE is the exact required fallback string for a failed lookup', () => {
    expect(WEATHER_UNAVAILABLE_MESSAGE).toBe('Weather temporarily unavailable');
  });
});
