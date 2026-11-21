# Project memory

## Product intent & audience

- Offline-first Android retail & service management app (Expo).
- Core domain: telecom retail — SIM cards and recharge cards sales.
- SMS integration: customers send SMS to the device; app processes and responds.
- Companion web dashboard for inventory, sales, and debt tracking.
- Primary users are Arabic-speaking shop owners/operators.
- Backend uses Supabase for the SMS outbox queue.

## Brand personality & voice

- Arabic-first UI and explanations.
- Clear, direct technical clarification; domain terms explained in plain Arabic.

## Visual design & UX direction

- Arabic RTL layout expected throughout the app and dashboard.
- Telecom-retail workflow: sales entry, customer lookup via phone/SIM number, SMS-driven interactions.
- Settings page includes SMS gateway controls with retry buttons for pending and failed messages.

## Decisions, constraints & rationale

- Local-first storage; sales records persisted on-device.
- Customer identification: match incoming SMS sender number or SIM number against saved `telecomSales` records.
- "زبون معروف" (known customer) = customer with a prior sales record in `telecomSales`; "غير معروف" = no prior record.
- Offline-first; no assumption of constant network for core retail operations.
- SMS gateway (outbox sender) is decoupled from SMS monitoring — gateway always runs on Android regardless of monitoring state. Rationale: stopping the built-in SMS app should not halt outgoing SMS processing.
- Stuck claim recovery: Java Android service reclaims rows with `claimed_at` set but `status='pending'` after 5 minutes; checks every 10 seconds.
- Failed retry also clears `claimed_at` to give messages a fresh chance.
- Outbox message states: `pending`, `claimed` (claimed_at set), `failed`.

## Open questions & assumptions

- Whether the known/unknown customer distinction should be removed or retained.
- Handling policy for unknown customers (reject, prompt, or auto-create) — undecided.
- Exact scope of web dashboard vs. mobile app features — to be clarified.
- Debt tracking mechanics and SMS response templates — details pending.