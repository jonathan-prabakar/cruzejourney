# Cruze FuelSense

**Cruze Maps Track — Four-Hour Hackathon Project Plan**

## One-sentence pitch

**Cruze understands the road ahead. FuelSense helps it understand the vehicle on that road.**

## Project overview

Cruze FuelSense is a proposed vehicle-intelligence extension for Cruze Maps. Cruze already focuses on traffic-wave prediction, driving guidance, navigation, and driver-related insights. FuelSense adds a distinct layer: it considers the *vehicle's own fuel state and engine diagnostics* when making recommendations.

The prototype helps drivers answer three questions:

1. **How far can I drive with my remaining fuel?**
2. **Where should I refuel along my route, considering reachability, detour, and price?**
3. **What does a vehicle diagnostic warning mean, and what should I do next?**

An optional fourth feature connects the concept to Cruze's smoother-driving mission by comparing modeled fuel consumption in different driving scenarios.

**Scope:** A functional, simulator-backed web prototype in four hours. Real OBD-II connectivity, live Cruze APIs, and production-grade fuel predictions are not prerequisites.

## The problem

Most navigation apps focus on the road, while a driver must separately consider fuel range and vehicle condition. A nearby station may be inconvenient, expensive, or outside the vehicle's conservative estimated range. Diagnostic codes can also be difficult for nontechnical drivers to interpret.

For long-distance drivers and fleets, these decisions affect trip planning and operating costs. FuelSense unifies the relevant information in one interface without rebuilding Cruze's existing traffic functionality.

## Four proposed features

### 1. Smart Fuel Monitoring — Core

**Goal:** Provide a continuously updated view of fuel and estimated driving range.

**User experience:**
- Show fuel percentage, estimated fuel remaining in gallons, fuel economy, and estimated range.
- Display a low-fuel warning when the planned route exceeds a conservative range threshold.
- Update the dashboard as simulated telemetry changes.

**Prototype logic:**
- Input: tank capacity, fuel percentage, estimated MPG, and optionally route distance.
- `gallons_remaining = tank_capacity_gal * fuel_percent / 100`
- `estimated_range_miles = gallons_remaining * estimated_mpg`
- `planning_range_miles = estimated_range_miles * 0.8` (illustrative 20% reserve; configurable).
- Clearly label all values as estimates and show when data is simulated.

**Estimated implementation time:** 35 minutes after setup.

**Acceptance test:** Adjusting fuel percentage updates estimated range and warning state without reloading the page.

### 2. Intelligent Fuel Stop Recommendations — Core and Signature Feature

**Goal:** Recommend a *reachable, practical* refueling stop along the route, not merely the geographically closest station.

**User experience:**
- Display a planned route and candidate fuel stations.
- Mark stations as within or outside conservative estimated range.
- Rank reachable stations using detour time and price (where known).
- Explain the recommendation in plain language.
- Recalculate when fuel level changes.

**Prototype logic:**
1. Obtain candidate stations from a seeded demo dataset or a maps/places API.
2. Calculate *driving distance along the route*, not straight-line distance, to each station.
3. Exclude candidates outside the planning range.
4. Score reachable candidates using a simple documented formula, such as `score = 0.5 * detour_minutes + 4 * price_per_gallon`; lower scores are preferred. Normalize or tune weights for the actual demo dataset.
5. Display the winning station and the reason it won.
6. If no station is within the planning range, show an explicit warning instead of inventing a safe stop.

**Important limitations:** Gas prices may be sample data, stations must support the vehicle's fuel type, and the system cannot guarantee a station is reachable. Truck-specific routing restrictions and diesel compatibility would need additional data for a production truck product.

**Estimated implementation time:** 60 minutes.

**Acceptance test:** Lowering simulated fuel makes a previously recommended station ineligible and triggers a new recommendation or a no-safe-stop warning.

### 3. Vehicle Health Assistant — Core, if time allows

**Goal:** Turn diagnostic trouble codes into understandable, appropriately cautious guidance.

**User experience:**
- Show an engine warning event.
- Display a diagnostic code, description, possible causes, and sensible next steps.
- Distinguish an observed code from a confirmed mechanical diagnosis.

**Prototype logic:**
- Simulate a code such as `P0301` (cylinder-one misfire detected).
- Look up the code in a small curated local JSON dictionary.
- Optionally use an LLM to rephrase verified information; do not let the model invent the code's meaning or claim a definitive diagnosis.
- Provide conservative advice when a condition may require stopping or professional inspection.

**Estimated implementation time:** 45 minutes.

**Acceptance test:** Triggering the sample fault updates the health panel and produces a correct, readable explanation.

### 4. Cruze Efficiency Insights — Optional Stretch Feature

**Goal:** Illustrate how smoother traffic flow might affect vehicle fuel consumption.

**User experience:**
- Compare two predefined driving scenarios: stop-and-go and smoother travel.
- Show modeled fuel use and the difference between scenarios.
- Explicitly label outputs as simulated estimates, not measured Cruze savings.

**Prototype logic:** Use a transparent simplified fuel-consumption model or fixed, documented sample inputs. Do not imply access to Cruze's internal traffic predictions unless actual integration is provided.

**Estimated implementation time:** 35 minutes.

**Acceptance test:** Switching scenarios updates the fuel comparison with clear assumptions.

## What we will NOT build in four hours

- Production OBD-II Bluetooth connectivity or broad vehicle compatibility.
- Real-time traffic-wave prediction (already central to Cruze's work).
- A replacement navigation platform.
- Advanced predictive maintenance, vibration-based fault classification, or camera-based driver assistance.
- Remote unlocking, engine control, braking, steering, or other safety-critical vehicle commands.
- A full fleet management platform, user accounts, or persistent trip history.

## Proposed technical architecture

```text
Simulated vehicle telemetry          Route + candidate station data
(fuel %, MPG, fault codes)           (seeded data or maps API)
              \                         /
               \                       /
                v                     v
                 FuelSense logic engine
                /          |          \
               v           v           v
          Range model  Station ranker  Code lookup
                \          |          /
                 \         |         /
                  v        v        v
                    React dashboard
              (map, gauges, alerts, insights)
```

### Suggested stack

- **Frontend:** Next.js, React, Tailwind CSS.
- **Map:** Mapbox GL JS or MapLibre; seeded routes are acceptable for a reliable demo.
- **Telemetry:** TypeScript simulator with a common interface for future real OBD-II input.
- **Business logic:** TypeScript functions for range, reachability, and station ranking.
- **Diagnostics:** Local JSON reference file; optional AI API for explanations.
- **Backend:** Next.js API routes only where needed; no database required for MVP.

### Future real-vehicle integration

A compatible OBD-II adapter can expose supported measurements such as speed, RPM, fuel level (not universal), coolant temperature, and diagnostic trouble codes. The adapter usually operates by polling vehicle PIDs; it is not a universal high-frequency data stream. Standard OBD-II does **not** generally supply GPS coordinates. A phone or external GPS receiver provides location. A bridge app/service connects the adapter to the FuelSense data interface.

## Four-hour build schedule

| Time | Task | Deliverable |
|---|---|---|
| 0:00–0:30 | Set up project, UI shell, telemetry simulator, sample route/stations | App loads with demo data |
| 0:30–1:05 | Implement fuel monitoring | Live gauge, range, low-fuel alert |
| 1:05–2:05 | Implement fuel-stop ranking | Reachability and explained recommendation |
| 2:05–2:50 | Implement diagnostic assistant | Sample fault and explanation |
| 2:50–3:25 | Optional efficiency comparison | Simulated scenario comparison |
| 3:25–4:00 | Test, polish, rehearse | Reliable end-to-end demonstration |

**Schedule contingency:** If the team is behind, skip the efficiency feature. If necessary, simplify diagnostics to a local code lookup. Preserve the fuel-monitoring-to-recommendation flow.

## Demo storyboard (about 2 minutes)

1. **Opening (15 sec):** “Cruze understands traffic; FuelSense adds awareness of the vehicle itself.”
2. **Vehicle state (20 sec):** Show a simulated truck on a route, including fuel level and range.
3. **Low-fuel event (35 sec):** Lower the fuel level. The system detects a range shortfall and highlights reachable fuel stops.
4. **Smart decision (30 sec):** Show why one station beats a nearer or cheaper alternative based on detour and safety margin. Lower fuel again to force recalculation.
5. **Health event (20 sec):** Inject a diagnostic code and show its explanation.
6. **Close (10 sec):** Explain how real OBD-II integration and Cruze traffic data could extend the prototype.

## Success criteria

- Fuel estimates update deterministically as inputs change.
- Recommendations exclude stations outside conservative planning range.
- The interface explains why a station was chosen.
- A no-reachable-station state is handled safely.
- Diagnostic information is accurate and clearly identified as informational.
- The demo distinguishes simulated data from live vehicle data.
- At least one end-to-end scenario works without external service failures.

## Differentiation and value to Cruze Maps

Cruze's existing public-facing emphasis is traffic-wave intelligence, navigation, smoother driving, and driving-related insights. FuelSense is intended to add **vehicle-specific fuel reachability, refueling decisions, and standard OBD-II diagnostic interpretation**, rather than duplicating traffic predictions or generic driving scores.

This is a proposed extension, not an official Cruze Maps integration. Public feature documentation should be rechecked before claiming that a particular feature is absent from Cruze's product.

## Future roadmap (outside hackathon)

1. Add compatible real OBD-II adapters and phone GPS.
2. Improve range estimation using observed per-vehicle fuel efficiency and uncertainty bounds.
3. Integrate real fuel-station inventory, fuel type, prices, and truck-safe routing.
4. Connect to Cruze's actual advisory outputs if the team grants access.
5. Validate efficiency comparisons with controlled real-world measurements.
6. Add optional fleet-level fuel and diagnostic reporting.

## Final pitch

> **Cruze understands the road ahead. FuelSense helps it understand the vehicle on that road.** By combining fuel awareness, route-based refueling recommendations, and understandable engine diagnostics, FuelSense adds a practical vehicle-intelligence layer to Cruze Maps. Our four-hour prototype demonstrates that experience using simulated telemetry and a working recommendation engine, with a clear path to real OBD-II integration.
