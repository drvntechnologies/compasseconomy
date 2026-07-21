# Compass Atlantic

**Virtual Airline Operations Management Platform**

Compass Atlantic is a full-featured airline management simulator for flight simulation enthusiasts. It connects to MSFS/P3D via SimConnect and provides a realistic airline operations experience — from passenger demand and route planning to real-time flight tracking and financial management.

## Features

- **Dashboard** — Overview of airline health, active flights, fleet status, and key metrics
- **Dispatch & Flight Logging** — Plan and log flights with SimBrief OFP integration
- **ACARS** — Real-time flight tracking with live telemetry from the simulator via SimConnect
- **Live Map** — Track active flights on an interactive map with coastline rendering and position history
- **Route Planner** — Design and manage your route network
- **Route Network Map** — Interactive OpenStreetMap visualization of the hub-and-spoke network with realtime auto-updates
- **Capacity Checker** — Analyze passenger demand across routes with reachability analysis (direct, 1-hop, 2-hop connections)
- **Fleet Management** — Manage aircraft with detailed weight/performance configurations
- **Gates** — Lease and manage airport gates with hourly billing
- **Finances** — Track revenue, expenses, and airline balance with atomic transaction safety
- **Cargo System** — Full cargo operations running parallel to passenger demand (pools, generation, booking integration)
- **NOTAMs** — Airline-wide notices and operational bulletins
- **Admin Panel** — User management, role assignments, system configuration, and CSV data export
- **Auto-Updater** — In-app update delivery via Tauri's updater plugin
- **Auth** — Email/password authentication with role-based access control
- **Themes** — Novelty Win98 and Win7 Aero visual themes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Runtime | Tauri v2 (Rust backend) |
| Frontend | React 18 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Database & Auth | Supabase (PostgreSQL, RLS, Edge Functions) |
| Mapping | React-Leaflet |
| Icons | Lucide React |
| Sim Integration | SimConnect SDK (via Rust FFI bindings) |
| Flight Planning | SimBrief API |

## Architecture

```
┌─────────────────────────────────────────────┐
│  React Frontend (Vite)                      │
│  Components: Dashboard, ACARS, LiveMap, ...  │
├─────────────────────────────────────────────┤
│  Tauri v2 Runtime                           │
│  ├── SimConnect Bridge (Rust)               │
│  ├── Auto-Updater                           │
│  └── Native Window Management               │
├─────────────────────────────────────────────┤
│  Supabase Backend                           │
│  ├── PostgreSQL (RLS-protected tables)      │
│  ├── Edge Functions (billing, ACARS, auth)  │
│  └── Realtime subscriptions                 │
└─────────────────────────────────────────────┘
```

## Passenger Boarding Logic

The demand system uses a sophisticated reachability algorithm:
- **Direct** — Passengers with matching origin/destination
- **1-hop connections** — Passengers who can connect through a single hub
- **2-hop connections** — Passengers routed through two intermediate stops

Demand is generated automatically and distributed across route pools, with booked passengers protected from cleanup cycles.

## Recent Changes (v0.3.1)

- **Cargo System** — Full cargo operations with pools, auto-generation, and booking integration (mirroring the passenger system)
- **Live Position Tracking** — Airport coordinates and aircraft position history powering the live map
- **Auto-Updater Infrastructure** — App releases table and Tauri updater check endpoint for seamless in-app updates
- **Financial Robustness** — Atomic balance adjustment function preventing race conditions on concurrent transactions
- **NOTAMs** — System-wide notices for operational awareness
- **Aircraft Weight Fields** — Detailed weight configurations (OEW, MTOW, fuel capacity) for realistic dispatch
- **SimBrief Integration** — Profile-linked SimBrief pilot IDs for one-click OFP imports
- **Departure Gate Assignment** — Gate selection during flight booking for operational realism
- **Admin Policy Expansion** — Extended admin capabilities for bookings and ACARS flight records
- **Admin CSV Export** — One-click export of gates, fleet, airports, routes, bookings, transactions, NOTAMs, and user profiles to CSV from the Admin Panel
- **Route Network Map** — Interactive OpenStreetMap visualization of the hub-and-spoke route network under Flight Ops, with realtime auto-updates when routes or airports change

## Development

```bash
# Install dependencies
npm install

# Run frontend dev server
npm run dev

# Build for production
npm run build

# Tauri desktop build (requires Rust toolchain + SimConnect SDK on Windows)
npm run tauri:build
```

## License

Proprietary — Compass Atlantic.
