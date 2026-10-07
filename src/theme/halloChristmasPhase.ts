import type { BrandMessage, HalloChristmasPhase } from './themeTypes';

/** Local calendar; January–October remain Halloween while this theme is selected. */
export const resolveHalloChristmasPhase = (date: Date): HalloChristmasPhase => {
  const month = date.getMonth();
  if (month < 10) return 'halloween';
  if (month === 10 && date.getDate() <= 2) return 'remembrance';
  return 'christmas';
};

export const HALLO_CHRISTMAS_MESSAGES: Record<HalloChristmasPhase, BrandMessage> = {
  halloween: { title: 'Happy Halloween!', subtitle: 'Wishing everyone a fun and spook-tacular celebration!' },
  remembrance: { title: 'May our departed loved ones rest in eternal peace.', subtitle: 'Remembering them with love, prayer, and gratitude.' },
  christmas: { title: 'Merry Christmas!', subtitle: 'Wishing everyone peace, joy, and warmth this Christmas season.' },
};

export const resolveHalloChristmasMessage = (phase: HalloChristmasPhase): BrandMessage => HALLO_CHRISTMAS_MESSAGES[phase];
