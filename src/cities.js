// Built-in city list. tz = IANA time zone ID.
export const CITIES = [
  { id: 'tokyo', tz: 'Asia/Tokyo', en: 'Japan (Tokyo)', ja: '日本（東京）' },
  { id: 'vancouver', tz: 'America/Vancouver', en: 'Vancouver', ja: 'バンクーバー' },
  { id: 'losangeles', tz: 'America/Los_Angeles', en: 'Los Angeles', ja: 'ロサンゼルス' },
  { id: 'sanfrancisco', tz: 'America/Los_Angeles', en: 'San Francisco', ja: 'サンフランシスコ' },
  { id: 'denver', tz: 'America/Denver', en: 'Denver', ja: 'デンバー' },
  { id: 'chicago', tz: 'America/Chicago', en: 'Chicago', ja: 'シカゴ' },
  { id: 'newyork', tz: 'America/New_York', en: 'New York', ja: 'ニューヨーク' },
  { id: 'toronto', tz: 'America/Toronto', en: 'Toronto', ja: 'トロント' },
  { id: 'honolulu', tz: 'Pacific/Honolulu', en: 'Honolulu', ja: 'ホノルル' },
  { id: 'london', tz: 'Europe/London', en: 'London', ja: 'ロンドン' },
  { id: 'paris', tz: 'Europe/Paris', en: 'Paris', ja: 'パリ' },
  { id: 'berlin', tz: 'Europe/Berlin', en: 'Berlin', ja: 'ベルリン' },
  { id: 'madrid', tz: 'Europe/Madrid', en: 'Madrid', ja: 'マドリード' },
  { id: 'dubai', tz: 'Asia/Dubai', en: 'Dubai', ja: 'ドバイ' },
  { id: 'delhi', tz: 'Asia/Kolkata', en: 'Delhi', ja: 'デリー' },
  { id: 'bangkok', tz: 'Asia/Bangkok', en: 'Bangkok', ja: 'バンコク' },
  { id: 'singapore', tz: 'Asia/Singapore', en: 'Singapore', ja: 'シンガポール' },
  { id: 'hongkong', tz: 'Asia/Hong_Kong', en: 'Hong Kong', ja: '香港' },
  { id: 'shanghai', tz: 'Asia/Shanghai', en: 'Shanghai', ja: '上海' },
  { id: 'seoul', tz: 'Asia/Seoul', en: 'Seoul', ja: 'ソウル' },
  { id: 'taipei', tz: 'Asia/Taipei', en: 'Taipei', ja: '台北' },
  { id: 'sydney', tz: 'Australia/Sydney', en: 'Sydney', ja: 'シドニー' },
  { id: 'auckland', tz: 'Pacific/Auckland', en: 'Auckland', ja: 'オークランド' },
];

export function cityById(id) {
  return CITIES.find((c) => c.id === id);
}
