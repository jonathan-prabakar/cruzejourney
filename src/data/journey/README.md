# Offline road-route cache

corridor-road-routes.json contains eight directed, adjacent-city OSRM road-route legs for San Antonio, New Braunfels, San Marcos, Kyle and Austin. Both travel directions are cached separately; reverse journeys do not reverse a one-way street geometry.

Retrieved 2026-10-31 from the [public OSRM routing endpoint](https://router.project-osrm.org/). Exact coordinates/options are reproducible in scripts/refresh-journey-routes.mjs. Data retains provider road distance (meters converted to miles), modeled driving duration in seconds, and step-derived longitude/latitude geometry.

© OpenStreetMap contributors. The road database/derived route data is available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). See [OSM attribution and copyright](https://www.openstreetmap.org/copyright). This license notice applies to cached road data, not an assertion about the license of the rest of the application. The map displays attribution.

Optional refresh: node scripts/refresh-journey-routes.mjs. This makes two public route requests for curated coordinates, with 30-second deadlines; runtime planning never requires a routing service. Do not run it repeatedly. Failed refreshes preserve the existing cache. Re-run tests/review geometry after refreshing.

These are driving-profile route estimates, not real-time traffic, commercial-truck clearance or access validation. Station identities, route positions, fuel prices, availability, amenities and additional access loops are fictional and authored separately. Generated access loops are explicitly modeled and must not be mistaken for verified service roads.


## Fictional truck stops

truck-stations.json adds four deterministic fictional diesel stations to the original M3 fixture. Axis miles locate them on supported cached route geometry in places.ts; every route catalog includes generated latitude/longitude, price, amenities, truckAccess=assumed-demo and modeled detour miles. Availability and truck access are demonstration assumptions, not real station or truck-clearance verification. No mapping, places or fuel-price API is called.
