// OWNER-MANUAL-TEST-CORRECTIONS item 4: confirmed source defect — the old
// sunny-branch message ("Beautiful sunny day! Perfect for a walk") was
// returned for EVERY temperature at or below 80°F, including 38°F. This
// module replaces that single-condition switch with a condition-AND-
// temperature-aware message, used by PatientHome.tsx. Kept as a pure,
// standalone function (no component/DOM/network dependency) so it can be
// unit tested directly — see src/lib/weatherMessage.test.ts.

export type WeatherCondition =
  | 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy'
  | 'snowy' | 'foggy' | 'clear-night' | 'autumn' | 'windy';

export type TempBand = 'extreme-cold' | 'cold' | 'cool' | 'mild' | 'hot' | 'extreme-heat';

/** Fahrenheit temperature bands used to choose safety-appropriate wording. */
export function getTempBand(tempF: number): TempBand {
  if (tempF <= 32) return 'extreme-cold';
  if (tempF <= 49) return 'cold';
  if (tempF <= 59) return 'cool';
  if (tempF <= 80) return 'mild';
  if (tempF <= 94) return 'hot';
  return 'extreme-heat';
}

// Shown instead of any fabricated reading when location or weather lookup
// fails — OWNER-MANUAL-TEST-CORRECTIONS item 4: "If location or weather
// lookup fails, show 'Weather temporarily unavailable' rather than
// inventing a sunny 68°F reading."
export const WEATHER_UNAVAILABLE_MESSAGE = 'Weather temporarily unavailable';

/**
 * Returns a condition-AND-temperature-aware message. Never recommends
 * outdoor activity (a walk) at cold/freezing temperatures regardless of
 * condition, and never claims comfort/safety that the data doesn't support.
 */
export function getWeatherMessage(condition: WeatherCondition, tempF: number): string {
  const band = getTempBand(tempF);

  switch (condition) {
    case 'sunny':
      if (band === 'extreme-cold') return 'Freezing and sunny — bundle up warmly if you go outside.';
      if (band === 'cold')         return 'Sunny but cold — wear a warm coat if you go outside.';
      if (band === 'cool')         return 'Crisp and sunny — a light jacket would feel good outside.';
      if (band === 'mild')         return 'Beautiful sunny day! Perfect for a walk.';
      if (band === 'hot')          return 'Hot and sunny — stay cool and drink water.';
      return 'Dangerously hot and sunny — stay indoors and stay hydrated.';

    case 'partly-cloudy':
      if (band === 'extreme-cold') return 'Freezing with some sun — stay warm inside.';
      if (band === 'cold')         return 'Chilly with some sun — dress warmly if you go outside.';
      if (band === 'hot' || band === 'extreme-heat') return 'Warm with some clouds — stay cool and hydrated.';
      return 'Some clouds but still nice out.';

    case 'cloudy':
      if (band === 'extreme-cold') return 'Freezing and grey — bundle up or stay cosy inside.';
      if (band === 'cold')         return 'A cold, grey day — dress warmly if you go out.';
      if (band === 'hot' || band === 'extreme-heat') return 'Warm and overcast — stay hydrated.';
      return 'A grey day — cosy inside.';

    case 'rainy':
      if (band === 'extreme-cold' || band === 'cold') return 'Cold rain today — stay warm and dry inside.';
      return 'Rainy day — perfect to stay cosy.';

    case 'stormy':
      return 'Stay safe and warm inside today.';

    case 'snowy':
      return "It's snowing! Stay warm and bundle up if you go outside.";

    case 'foggy':
      if (band === 'extreme-cold' || band === 'cold') return 'Cold and misty — bundle up and take it easy.';
      return 'A misty morning. Take it easy.';

    case 'clear-night':
      if (band === 'extreme-cold' || band === 'cold') return 'Cold, clear night — stay warm and rest well.';
      return 'Clear night — a good time to rest.';

    case 'autumn':
      if (band === 'extreme-cold' || band === 'cold') return 'Cold autumn day — bundle up if you go outside.';
      return 'Beautiful autumn day. Leaves are turning.';

    case 'windy':
      if (band === 'extreme-cold' || band === 'cold') return 'Cold and breezy — a warm coat is a good idea.';
      return 'A breezy day outside.';
  }
}
