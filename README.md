# ChoreQuest

A cross-platform household chore management platform that turns recurring tasks into rewarding quests. Families create recurring chores, assign them to members on a weekly schedule, and track completion with points, streaks, achievements, and an allowance system tied to task completion.

**Live:** [chores.steinmetz.ltd](https://chores.steinmetz.ltd)

---

## Features

- **Multi-tenant households** -- each family operates in an isolated workspace with invite-code-based onboarding
- **Recurring task engine** -- RRULE-based recurrence with a weekly assignment grid supporting per-day, per-member scheduling and biweekly intervals; task instances generated 30 days ahead via cron
- **Real-time updates** -- Socket.IO broadcasts task completions, assignments, and status changes to all household members instantly
- **Gamification** -- points, streaks, achievement badges, and a household leaderboard
- **Allowance system** -- configurable rate-per-point with daily ledger processing, balance tracking, and parent-controlled payouts
- **Family GPS location sharing** -- real-time member positions on a native map view (mobile only)
- **Parent analytics dashboard** -- completion rates, trends, and per-member performance over time
- **Calendar views** -- day, week, and month views with inline task management
- **Push notifications** -- web push (VAPID) and native (Expo) for daily reminders and overdue alerts
- **Dark theme UI** -- mobile-first design with NativeWind (Tailwind CSS)

## Tech Stack

### Frontend (Cross-Platform)

| Technology | Purpose |
|---|---|
| Expo SDK 55 + React Native | Single codebase for iOS, Android, and web |
| Expo Router v3 | File-based navigation with typed routes |
| React Query v5 | Server state management and cache |
| Socket.IO Client | Real-time event consumption |
| NativeWind / Tailwind CSS | Utility-first styling |
| Lucide React Native | Icon library |
| Expo Location + Maps | GPS tracking and map rendering |
| Expo Secure Store | Encrypted token storage on native devices |

### Backend

| Technology | Purpose |
|---|---|
| Node.js + Express 5 | REST API server |
| PostgreSQL 16 | Multi-tenant relational database |
| Redis 7 | Distributed cron locks and caching |
| Socket.IO | Real-time WebSocket server with household rooms |
| Knex.js | Query builder and migration runner |
| rrule | RFC 5545 recurrence rule parsing |
| JWT + bcrypt | Authentication (15-min access / 7-day refresh tokens) |
| node-cron | Scheduled task generation and notifications |
| web-push | VAPID push notifications |

### Infrastructure

| Technology | Purpose |
|---|---|
| Docker Swarm | Orchestration (4 services) |
| Traefik | Reverse proxy with automatic HTTPS via Let's Encrypt |
| nginx | Static file serving + API/WebSocket proxying |
| Docker Secrets | Credential management (zero env-var secrets) |

## Architecture

ChoreQuest uses a multi-tenant architecture where every database table is scoped by `household_id`. JWT tokens carry household context (`hid` claim), and all API queries filter on the authenticated household -- preventing any cross-tenant data access.

```
                                         +------------------+
                                         |   PostgreSQL 16  |
                                         |  (household-     |
  Browser / Mobile App                   |   scoped tables) |
         |                               +--------^---------+
         v                                        |
  +--------------+     +------------------+       |
  |   Traefik    |---->|     nginx        |       |
  | (HTTPS/TLS)  |     | (static + proxy) |       |
  +--------------+     +--------+---------+       |
                                |                 |
                       /api/*   |   /socket.io/*  |
                                v                 |
                       +------------------+       |
                       |  Express API     +-------+
                       |  + Socket.IO     |       |
                       |  + Cron Scheduler|       |
                       +--------+---------+       |
                                |                 |
                                v                 |
                       +------------------+       |
                       |     Redis 7      |-------+
                       | (distributed     |
                       |  cron locks)     |
                       +------------------+
```

The task engine supports two scheduling modes:

1. **RRULE recurrence** -- standard RFC 5545 rules for simple repeating patterns
2. **Weekly assignment grid** -- a JSON map of `{ dayOfWeek: [memberId, ...] }` enabling per-day, per-member task distribution with biweekly interval support

A cron job runs at midnight to generate task instances 30 days ahead. Additional cron jobs handle morning reminders (8 AM), overdue alerts (8 PM), and daily allowance processing (11:59 PM). All cron jobs use Redis distributed locks to prevent duplicate execution in multi-replica deployments.

## Project Structure

```
chorequest/
├── api/                        # Express.js backend
│   ├── src/
│   │   ├── routes/             # REST API endpoints
│   │   │   ├── auth.ts         #   Authentication (login, signup, refresh, join)
│   │   │   ├── tasks.ts        #   Task instance CRUD and completion
│   │   │   ├── templates.ts    #   Task template management
│   │   │   ├── members.ts      #   Household member management
│   │   │   ├── allowance.ts    #   Allowance settings and ledger
│   │   │   ├── analytics.ts    #   Completion rates and trends
│   │   │   ├── gamification.ts #   Points, streaks, achievements, leaderboard
│   │   │   ├── locations.ts    #   GPS location sharing
│   │   │   ├── push.ts         #   Push notification subscriptions
│   │   │   ├── audit.ts        #   Audit log queries
│   │   │   ├── settings.ts     #   App settings per household
│   │   │   └── template-library.ts  # Pre-built chore templates
│   │   ├── services/           # Business logic
│   │   │   ├── auth.ts         #   JWT issuance, refresh, bcrypt hashing
│   │   │   ├── achievements.ts #   Achievement evaluation engine
│   │   │   ├── allowance.ts    #   Daily allowance calculation
│   │   │   ├── push.ts         #   Push notification delivery
│   │   │   ├── overdue.ts      #   Overdue task escalation
│   │   │   ├── streaks.ts      #   Streak tracking
│   │   │   └── audit.ts        #   Audit log recording
│   │   ├── middleware/
│   │   │   └── auth.ts         #   JWT verification + role gating
│   │   ├── websocket.ts        # Socket.IO server (household rooms)
│   │   ├── redis.ts            # Redis client + distributed locks
│   │   ├── scheduler.ts        # Cron-based task instance generation
│   │   ├── db.ts               # Knex database client
│   │   └── index.ts            # Server entrypoint
│   └── migrations/             # PostgreSQL schema migrations (Knex)
├── app/                        # Expo cross-platform application
│   ├── app/
│   │   ├── (auth)/             # Auth screens
│   │   │   ├── login.tsx       #   Email/password login
│   │   │   ├── signup.tsx      #   Account registration + household creation
│   │   │   └── join.tsx        #   Join household via invite code
│   │   └── (tabs)/             # Main application tabs
│   │       ├── index.tsx       #   Dashboard (today's tasks, streaks, quick stats)
│   │       ├── tasks.tsx       #   Task management and completion
│   │       ├── calendar.tsx    #   Day/week/month calendar view
│   │       ├── scores.tsx      #   Leaderboard, achievements, streaks
│   │       ├── allowance.tsx   #   Allowance balances and ledger
│   │       ├── map.tsx         #   Family GPS location map
│   │       └── settings.tsx    #   Household and account settings
│   ├── components/             # Shared UI components
│   ├── hooks/
│   │   └── useWebSocket.ts     # Socket.IO connection + event handling
│   ├── providers/
│   │   ├── AuthProvider.tsx    # JWT auth context with token refresh
│   │   └── QueryProvider.tsx   # React Query client configuration
│   └── lib/
│       ├── api.ts              # Typed HTTP client for all API endpoints
│       ├── constants.ts        # API URL, colors, configuration
│       └── storage.ts          # Platform-adaptive storage (SecureStore / AsyncStorage)
├── docker/
│   ├── api/Dockerfile          # Node 20 Alpine, non-root user, healthcheck
│   └── frontend/
│       ├── Dockerfile          # Multi-stage: Expo web export -> nginx
│       └── nginx.conf          # Static serving + API/WS reverse proxy
├── landing/                    # Marketing landing page (static HTML)
└── docker-compose.yml          # Docker Swarm stack (4 services)
```

## Database Schema

PostgreSQL 16 with 13 tables across 9 migrations:

| Table | Purpose |
|---|---|
| `users` | Authentication accounts (email/username, bcrypt password hash) |
| `households` | Tenant isolation (name, timezone, invite code with expiry) |
| `household_members` | Family members linked to users and households, with roles |
| `task_templates` | Recurring chore definitions (RRULE, weekly assignments, points) |
| `task_instances` | Individual task occurrences with status and completion tracking |
| `achievements` | Achievement definitions (key, threshold, category) |
| `member_achievements` | Unlocked achievements per member |
| `allowance_settings` | Per-household allowance configuration (rate per point, enabled) |
| `allowance_ledger` | Financial transactions (earned, payout, adjustment) |
| `member_locations` | Latest GPS coordinates per member |
| `push_subscriptions` | Web push and Expo push token registrations |
| `audit_log` | Action audit trail with JSONB details |
| `refresh_tokens` | JWT refresh token hashes with expiry |

All tenant-scoped tables include a `household_id` foreign key with cascading deletes and appropriate composite indexes.

## Security

- **Authentication:** JWT with 15-minute access tokens and 7-day refresh tokens; bcrypt password hashing (cost factor 12)
- **Authorization:** Role-based access control (parent/child) enforced via middleware on every protected route
- **Tenant isolation:** All queries scoped by `household_id` from the JWT `hid` claim -- no cross-household data access
- **Rate limiting:** 200 requests per minute globally; stricter limits on auth endpoints (express-rate-limit)
- **Transport security:** Traefik terminates TLS with Let's Encrypt; HSTS preload, frame-deny, content-type-nosniff, XSS filter, and referrer-policy headers
- **Security headers:** Helmet.js on the API; permissions-policy restricts camera, microphone, and geolocation
- **Secrets management:** All credentials stored as Docker Swarm secrets mounted at `/run/secrets/` -- never in environment variables or source code
- **Redis authentication:** `requirepass` enforced, password read from Docker secret at runtime
- **Container hardening:** API runs as non-root user (UID 1001); memory limits on all services; health checks with restart policies
- **Input validation:** express-validator on all request bodies; parameterized queries via Knex (no raw SQL string concatenation)

## Running Locally

**Prerequisites:** Docker with Swarm mode enabled (`docker swarm init`).

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/chorequest.git
   cd chorequest
   ```

2. Create the required Docker secrets:
   ```bash
   openssl rand -base64 32 | docker secret create chorequest_db_password -
   openssl rand -base64 32 | docker secret create chorequest_jwt_secret -
   openssl rand -base64 32 | docker secret create chorequest_redis_password -
   # Generate VAPID keys: npx web-push generate-vapid-keys
   echo "your-vapid-public-key" | docker secret create chorequest_vapid_public -
   echo "your-vapid-private-key" | docker secret create chorequest_vapid_private -
   echo "your-email@example.com" | docker secret create chorequest_vapid_email -
   ```

3. Build and deploy:
   ```bash
   docker build -t chorequest-api:latest -f docker/api/Dockerfile .
   docker build -t chorequest-frontend:latest -f docker/frontend/Dockerfile .
   docker stack deploy -c docker-compose.yml chorequest
   ```

4. Verify all services are running:
   ```bash
   docker service ls --filter name=chorequest
   ```

The API runs migrations automatically on startup. The frontend is available on port 80 (behind Traefik in production, or directly via `docker service` port publishing for local development).

## License

MIT
