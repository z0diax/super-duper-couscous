import type { SystemThemeId, WeatherTheme } from './themeTypes';

export type LoaderContentType = 'inspiration' | 'trivia';
export type LoaderThemeContent = Readonly<{ type: LoaderContentType; text: string }>;
type ContentPool = readonly LoaderThemeContent[];
const inspiration = (text: string): LoaderThemeContent => ({ type: 'inspiration', text });
const trivia = (text: string): LoaderThemeContent => ({ type: 'trivia', text });

// Original, unattributed lines. Cultural/historical trivia references:
// https://www.un.org/en/observances/womens-day
// https://asia.si.edu/whats-on/events/celebrations/lunar-new-year-celebration/
// https://www.noaa.gov/stories/how-do-snowflakes-form-science-behind-snow
export const THEME_LOADER_CONTENT: Record<Exclude<SystemThemeId, 'weather-sync'>, ContentPool> = {
  classic: [
    inspiration('Small progress still moves the work forward.'),
    inspiration('A calm start leaves room for careful work.'),
    inspiration('An organized record makes the next step easier.'),
    inspiration('Good work grows from patience and consistency.'),
    inspiration('A clear handoff helps the whole team.'),
    inspiration('One task at a time can make a full day count.'),
    inspiration('Care with details saves someone time later.'),
    trivia('Alphabetical order is one way to organize records.'),
  ],
  government: [
    inspiration('Good public service begins with work done with care.'),
    inspiration('A dependable team makes everyday service smoother.'),
    inspiration('Clear records help us serve people well.'),
    inspiration('Integrity shows in the small decisions we make.'),
    inspiration('A thoughtful response can make someone\'s day easier.'),
    inspiration('Shared responsibility helps keep service moving.'),
    inspiration('Every carefully completed task supports the community.'),
    trivia('A record can be kept on paper or in digital form.'),
  ],
  valentine: [
    inspiration('A little appreciation goes a long way at work.'),
    inspiration('Kindness belongs in the everyday details.'),
    inspiration('A thoughtful handoff is a small act of care.'),
    inspiration('Make room for a thank-you today.'),
    inspiration('Good teamwork starts with listening.'),
    inspiration('A friendly word can brighten a busy morning.'),
    inspiration('Care for the work and the people beside you.'),
    trivia('Valentine\'s Day falls on February 14.'),
  ],
  'womens-month': [
    inspiration('Recognize the women whose work keeps things moving.'),
    inspiration('Make room for every voice at the table.'),
    inspiration('Opportunity grows when we share what we know.'),
    inspiration('Women\'s contributions deserve recognition every day.'),
    inspiration('Leadership can begin with one thoughtful decision.'),
    inspiration('Celebrate achievement and open doors for others.'),
    inspiration('A fair chance can bring a new idea forward.'),
    trivia('International Women\'s Day is observed on March 8.'),
  ],
  'breast-cancer-awareness': [
    inspiration('A small gesture of support can mean a great deal.'),
    inspiration('Make room for kindness in today\'s work.'),
    inspiration('Hope has a place in everyday conversations.'),
    inspiration('Listening is one way to show you care.'),
    inspiration('Compassion helps a community feel connected.'),
    inspiration('Support can be as simple as being present.'),
    inspiration('A caring workplace leaves room for one another.'),
    inspiration('Let awareness be a reminder to treat people gently.'),
  ],
  'amihan-bloom': [
    inspiration('Give good ideas a little room to grow.'),
    inspiration('A fresh start can begin with one small task.'),
    inspiration('Patient care helps both gardens and good work grow.'),
    inspiration('Let a quiet moment make space for a new idea.'),
    inspiration('Renewal can be as simple as trying a fresh approach.'),
    inspiration('Steady care brings its own kind of bloom.'),
    inspiration('Start gently, then find your rhythm.'),
    trivia('Many flowering plants produce seeds inside fruit.'),
  ],
  winter: [
    inspiration('Quiet progress still brings the work forward.'),
    inspiration('A warm welcome can brighten a cool morning.'),
    inspiration('Take a calm start into the rest of the day.'),
    inspiration('Patience leaves room for careful decisions.'),
    inspiration('A little warmth goes a long way in a team.'),
    inspiration('Keep a steady pace through the quieter season.'),
    inspiration('Small acts of care bring warmth to a workday.'),
    trivia('Snow crystals commonly form with six-fold symmetry.'),
  ],
  'chinese-new-year': [
    inspiration('Welcome a fresh beginning with gratitude.'),
    inspiration('May the new season bring good things to share.'),
    inspiration('A new beginning makes room for thoughtful plans.'),
    inspiration('Carry appreciation into the year ahead.'),
    inspiration('Shared moments make a celebration feel complete.'),
    inspiration('Let renewal inspire one useful step today.'),
    inspiration('Good fortune feels richer when shared.'),
    trivia('The Lantern Festival marks the end of New Year celebrations.'),
  ],
  'hallo-christmas': [
    inspiration('A little spooky, a little merry, and ready for the day.'),
    inspiration('Every season brings something worth celebrating.'),
    inspiration('Bring a little seasonal cheer to the task ahead.'),
    inspiration('No tricks today, just thoughtful teamwork.'),
    inspiration('A warm welcome works in every season.'),
    inspiration('Leave room for a little wonder in a busy day.'),
    trivia('Halloween falls on October 31.'),
    trivia('Evergreen trees keep their foliage through the seasons.'),
  ],
  festive: [
    inspiration('Take a moment to appreciate what the team has done.'),
    inspiration('Small accomplishments deserve a little celebration.'),
    inspiration('Gratitude adds warmth to a busy day.'),
    inspiration('Shared effort gives us something to celebrate.'),
    inspiration('Bring today\'s good energy to the next task.'),
    inspiration('A thank-you can be the brightest part of a workday.'),
    inspiration('Celebrate progress, then make room for what comes next.'),
    trivia('Confetti can be made from small pieces of colored paper.'),
  ],
  'rainy-season': [
    inspiration('Steady progress still counts on rainy days.'),
    inspiration('A little preparation makes the day easier.'),
    inspiration('Let the rain set a calmer pace for careful work.'),
    inspiration('Patient teamwork helps the day move along.'),
    inspiration('A grey sky can still frame a productive day.'),
    inspiration('Keep a little room in the day for changing plans.'),
    trivia('Rain is liquid water falling from clouds.'),
    trivia('Rain is part of the water cycle.'),
  ],
};

export const WEATHER_LOADER_CONTENT: Record<WeatherTheme, ContentPool> = {
  sunny: [
    inspiration('A bright start is a good time to make progress.'),
    inspiration('Bring a little daylight into the task ahead.'),
    inspiration('Clear skies leave room for a fresh plan.'),
    inspiration('Share a little of today\'s brightness with the team.'),
    trivia('Sunlight provides energy for plant growth.'),
    trivia('The Sun is a star.'),
  ],
  cloudy: [
    inspiration('Not every productive day needs clear skies.'),
    inspiration('A softer sky can suit a thoughtful start.'),
    inspiration('Keep your plans clear, even under cloudy skies.'),
    inspiration('A quiet morning can make room for good work.'),
    trivia('Clouds contain tiny water droplets or ice crystals.'),
    trivia('Fog is a cloud near the ground.'),
  ],
  windy: [
    inspiration('Stay steady even when the day keeps moving.'),
    inspiration('A fresh breeze can accompany a fresh start.'),
    inspiration('Leave room to adjust while keeping your direction.'),
    inspiration('Keep a steady hand on the task ahead.'),
    trivia('Wind is air in motion.'),
    trivia('A weather vane shows wind direction.'),
  ],
  rainy: THEME_LOADER_CONTENT['rainy-season'],
  thunderstorm: [
    inspiration('Even storms eventually move on.'),
    inspiration('A calm approach helps when plans change.'),
    inspiration('Take the day one manageable task at a time.'),
    inspiration('Steady teamwork brings a little calm to the day.'),
    inspiration('Give yourself a moment to settle into the work.'),
    trivia('Thunder is the sound produced by lightning.'),
  ],
  winter: THEME_LOADER_CONTENT.winter,
};

/** Unknown weather uses neutral Classic content without waiting for a request. */
export const resolveLoaderContentPool = (theme: SystemThemeId, weather: WeatherTheme | null): ContentPool =>
  theme === 'weather-sync' ? (weather ? WEATHER_LOADER_CONTENT[weather] : THEME_LOADER_CONTENT.classic) : THEME_LOADER_CONTENT[theme];

export const selectLoaderContent = (pool: ContentPool, random: () => number = Math.random): LoaderThemeContent =>
  pool[Math.floor(random() * pool.length)];
