# Passenger Boarding Logic

Reference for how passengers are selected and prioritized when booking a flight.

## Core Principle

A passenger should only board a flight if that flight gets them **closer to their final destination** within the airline's route network. "Closer" means the arrival airport has a direct or 2-hop route to the passenger's final destination.

## Eligibility Filter

A passenger pool at the departure airport is eligible for a flight if ANY of these are true:

1. **Terminating**: The passenger's final destination IS the arrival airport.
2. **1-hop reachable**: The passenger has `connections_remaining > 0` AND the arrival airport has an active route directly to their final destination.
3. **2-hop reachable**: The passenger has `connections_remaining > 1` AND their final destination is reachable from the arrival airport within 2 hops (arrival -> intermediate -> destination).

### What is NOT checked

- Whether the arrival is a "hub" -- hub status alone is not sufficient. The actual route network must show a path.
- Whether the passenger could reach their destination from the current departure airport -- we don't exclude passengers who could also go direct from here. The pilot chose this route; we honor it.

## Boarding Priority (Sort Order)

When more eligible passengers exist than seats available, board in this order:

| Priority | Criteria | Rationale |
|----------|----------|-----------|
| 1 | Terminating (destination = arrival) | They MUST go on this flight; no other flight will get them home. |
| 2 | 1-hop reachable from arrival | One more leg after this and they're done. |
| 3 | 2-hop reachable from arrival | Two more legs; less urgent. |
| 4 (tiebreaker) | Layover status | Passengers already on a layover (been waiting) get priority over fresh `waiting` passengers within the same tier. |
| 5 (tiebreaker) | Fewer connections remaining | A passenger with 1 connection left is closer to finishing their journey than one with 2+. |

## Status Lifecycle

```
waiting -> in_transit -> layover -> in_transit -> ... -> arrived
```

- `waiting`: Passenger is at their origin, hasn't boarded anything yet.
- `in_transit`: Passenger is on a booked flight.
- `layover`: Passenger landed at an intermediate airport, needs another flight.
- `arrived`: Passenger reached their final destination.

## Connections Remaining

- Generated at demand creation time based on the route network.
- Decremented each time a passenger lands at an intermediate (not-final) airport.
- A passenger with `connections_remaining = 0` should ONLY be boarded on a flight going to their exact destination.

## Examples

### Good Booking: TPA -> ATL

Passenger pool: 25 PAX at KTPA wanting to go to KMSY.  
ATL has an active route to KMSY.  
Result: Eligible (1-hop reachable). Boards the flight, will connect at ATL.

### Bad Booking (prevented): TPA -> IAD

Same passenger pool: 25 PAX at KTPA wanting KMSY.  
IAD does NOT have a route to KMSY.  
IAD's connections (KATL, KRDU, etc.) do reach KMSY via KATL, but that's a 2-hop and the passenger only has 1 connection remaining.  
Result: NOT eligible. Does not board.

### 2-Hop Example: TPA -> IAD (valid case)

Passenger pool: 10 PAX at KTPA wanting KMSY with `connections_remaining = 2`.  
IAD -> ATL -> KMSY is a valid 2-hop path.  
Result: Eligible (2-hop reachable with 2 connections remaining). Boards the flight.

## Key Design Decisions

1. **Route-network-aware, not distance-aware**: We don't measure geographic distance. "Closer" means reachable within fewer connections via actual routes.
2. **No hub magic**: Hub airports get no special treatment beyond the routes they actually serve.
3. **Terminating passengers always win**: If the plane is going to IAD, people who need IAD fill first. Connecting passengers get remaining seats.
4. **Conservative on multi-hop**: We only allow 2-hop lookahead. A passenger needing 3+ hops to reach their destination from the arrival airport is NOT eligible, even if a theoretical path exists. This prevents sending people on wild goose chases.
