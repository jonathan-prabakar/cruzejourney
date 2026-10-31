import type { FuelStation } from "../types";
/** Unit-test numbers only; no geographic locations, never imported by application code. */
const inputs: FuelStation[] = [
  {
    "id": "demo-01",
    "name": "Alamo Corridor Demo Diesel",
    "latitude": null,
    "longitude": null,
    "fuelTypes": [
      "diesel"
    ],
    "pricePerGallon": 3.89,
    "priceSource": "sample",
    "distanceAlongRouteMiles": 6,
    "detourMiles": 0.8,
    "isAvailable": true,
    "isSynthetic": true
  },
  {
    "id": "demo-02",
    "name": "Comal Demo Fuel",
    "latitude": null,
    "longitude": null,
    "fuelTypes": [
      "diesel",
      "regular"
    ],
    "pricePerGallon": 3.65,
    "priceSource": "sample",
    "distanceAlongRouteMiles": 14,
    "detourMiles": 1.2,
    "isAvailable": true,
    "isSynthetic": true
  },
  {
    "id": "demo-03",
    "name": "Guadalupe Demo Truck Stop",
    "latitude": null,
    "longitude": null,
    "fuelTypes": [
      "diesel"
    ],
    "pricePerGallon": 3.55,
    "priceSource": "sample",
    "distanceAlongRouteMiles": 25,
    "detourMiles": 0.6,
    "isAvailable": true,
    "isSynthetic": true
  },
  {
    "id": "demo-04",
    "name": "New Braunfels Demo Energy",
    "latitude": null,
    "longitude": null,
    "fuelTypes": [
      "diesel"
    ],
    "pricePerGallon": 3.49,
    "priceSource": "sample",
    "distanceAlongRouteMiles": 32,
    "detourMiles": 0.7,
    "isAvailable": false,
    "isSynthetic": true
  },
  {
    "id": "demo-05",
    "name": "San Marcos Demo Diesel",
    "latitude": null,
    "longitude": null,
    "fuelTypes": [
      "diesel"
    ],
    "pricePerGallon": 3.59,
    "priceSource": "sample",
    "distanceAlongRouteMiles": 40,
    "detourMiles": 0.4,
    "isAvailable": true,
    "isSynthetic": true
  },
  {
    "id": "demo-06",
    "name": "Blanco Corridor Demo Fuel",
    "latitude": null,
    "longitude": null,
    "fuelTypes": [
      "regular"
    ],
    "pricePerGallon": 3.19,
    "priceSource": "sample",
    "distanceAlongRouteMiles": 47,
    "detourMiles": 0.5,
    "isAvailable": true,
    "isSynthetic": true
  },
  {
    "id": "demo-07",
    "name": "Kyle Demo Travel Fuel",
    "latitude": null,
    "longitude": null,
    "fuelTypes": [
      "diesel",
      "regular"
    ],
    "pricePerGallon": 3.35,
    "priceSource": "sample",
    "distanceAlongRouteMiles": 53,
    "detourMiles": 0.9,
    "isAvailable": true,
    "isSynthetic": true
  },
  {
    "id": "demo-08",
    "name": "Buda Demo Truck Fuel",
    "latitude": null,
    "longitude": null,
    "fuelTypes": [
      "diesel"
    ],
    "pricePerGallon": null,
    "priceSource": "sample",
    "distanceAlongRouteMiles": 60,
    "detourMiles": 0.3,
    "isAvailable": true,
    "isSynthetic": true
  },
  {
    "id": "demo-09",
    "name": "South Austin Demo Energy",
    "latitude": null,
    "longitude": null,
    "fuelTypes": [
      "diesel"
    ],
    "pricePerGallon": 3.25,
    "priceSource": "sample",
    "distanceAlongRouteMiles": 67,
    "detourMiles": 1.1,
    "isAvailable": true,
    "isSynthetic": true
  },
  {
    "id": "demo-10",
    "name": "Austin Demo Fuel Depot",
    "latitude": null,
    "longitude": null,
    "fuelTypes": [
      "diesel"
    ],
    "pricePerGallon": 3.29,
    "priceSource": "sample",
    "distanceAlongRouteMiles": 73,
    "detourMiles": null,
    "isAvailable": true,
    "isSynthetic": true
  }
];
export function getDemoFuelStations(): FuelStation[] { return structuredClone(inputs); }
