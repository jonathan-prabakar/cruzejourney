import { writeFile } from 'node:fs/promises';
const locations = [
  ['san-antonio', -98.4936, 29.4241], ['new-braunfels', -98.126, 29.703],
  ['san-marcos', -97.942, 29.883], ['kyle', -97.842, 30.006], ['austin', -97.7431, 30.2672],
];
const legs = [];
for (const list of [locations, [...locations].reverse()]) {
  const coordinates = list.map(l => l.slice(1).join(',')).join(';');
  const url = 'https://router.project-osrm.org/route/v1/driving/' + coordinates + '?overview=full&geometries=geojson&steps=true';
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Routing service unavailable; existing offline cache was not changed.');
  const data = await response.json();
  if (data.code !== 'Ok' || data.routes?.[0]?.legs.length !== 4) throw new Error('Unexpected route response; existing cache retained.');
  data.routes[0].legs.forEach((leg, i) => {
    const points = [];
    leg.steps.forEach(step => step.geometry.coordinates.forEach(point => {
      if (!points.length || point[0] !== points.at(-1)[0] || point[1] !== points.at(-1)[1]) points.push(point);
    }));
    legs.push({ originId: list[i][0], destinationId: list[i + 1][0], distanceMiles: leg.distance / 1609.344, durationSeconds: leg.duration, coordinates: points });
  });
}
const metadata = {
  provider: 'OSRM public demo routing service', source: 'https://router.project-osrm.org/route/v1/driving/',
  retrievedOn: new Date().toISOString().slice(0, 10),
  attribution: '© OpenStreetMap contributors; road data under ODbL 1.0',
  license: 'https://opendatacommons.org/licenses/odbl/1-0/',
  notice: 'Cached driving-profile road routes, not live traffic or truck-access validation. Fictional stop access loops are separate modeled geometry.',
};
await writeFile(new URL('../src/data/journey/corridor-road-routes.json', import.meta.url), JSON.stringify({ metadata, legs }) + '\n');
