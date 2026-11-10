import fs from 'node:fs';

const original = JSON.parse(fs.readFileSync(new URL('../../data/uarl.json', import.meta.url)));
export const reportedPositions = [1, 2, 3, 6, 7, 8, 10, 11, 13, 15, 16, 17];
export const baseline = [
  ['lancejuly', 'Lance', '88', 281], ['JJElliott2004', 'James', '84', 234],
  ['GuillermoChase', 'Gman', '81', 188], ['UN88475544', 'Haydon', '20', 171],
  ['IIKyle5Larson', 'Rocky', '22', 150], ['pa05', 'Payson', '05', 124],
  ['John_Hunter38', 'John', '24', 118], ['Kingofgamez', 'King', '77', 92],
  ['Aokikoto', 'Hailey', '28', 83], ['58bbwapache', 'Dale', '16', 76],
  ['Frogboy4783', 'Frog', '5', 68], ['FueledByMayonnaise', 'Max', '19', 54],
  ['TBDAN1E', 'Daniel', '72', 42], ['Comodw', 'Jay', '9', 40],
  ['PlaneFan638', 'Plane', '61', 30], ['codydgoforth', 'Cody', '60', 8],
  ['AnyGameAnyTime09', 'Muffin', '2', 5]
];
export function brokenStandings() {
  const data = structuredClone(original);
  data.records = [];
  data.standings = baseline.map(([username, name, number, pointsAdjustment], i) => ({ id: 'd1:' + username.toLowerCase(), division: 'd1', username, name, number, nameManual: true, numberManual: true, pointsAdjustment, previousPosition: null, order: i + 1, orderManual: true }));
  data.drivers.previousRoster.standings = structuredClone(data.standings);
  data.drivers.profiles.JJElliott2004.alias = 'James';
  delete data.drivers.displayNameVersion;
  for (const position of reportedPositions) delete data.standings[position - 1].name;
  return data;
}
