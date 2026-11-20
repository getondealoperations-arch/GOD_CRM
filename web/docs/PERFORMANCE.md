# Performance test (SRS §18)

Run it yourself:
```bash
DATABASE_URL=mysql://root@localhost:3306/getondeal_perf npm run db:demo        # separate database!
DATABASE_URL=mysql://root@localhost:3306/getondeal_perf npm run perf:seed -- 100000
npm run build && DATABASE_URL=…/getondeal_perf AUTOMATION=off npx next start -p 3200
npm run perf:load -- http://localhost:3200 admin@getondeal.local Admin@123 20 30
```
`perf:seed` refuses to run unless the database name contains perf/test/staging.

## Results — 20 Nov 2026
Setup: one Apple-silicon laptop running both the app (production build) and MariaDB 12.3; **100,400 leads, 76,000 calls**; 20 virtual users with **no think time** (each fires the next request as soon as the last returns — roughly the load of a few hundred real users clicking normally).

| | Before tuning | After tuning |
|---|---|---|
| Throughput | 11 req/s | **30 req/s** |
| Median latency (20 users) | 1,744 ms | **706 ms** |
| p95 latency (20 users) | 3,554 ms | **1,428 ms** |
| Median latency (1 user) | 175 ms | **81 ms** |
| Errors | 0 | 0 |

Per route after tuning (20 users): API list 37 ms, follow-ups 176 ms, calling 203 ms, leads list 336 ms, leads page 50 sorted by score 459 ms, pipeline 855 ms, campaign report 854 ms, search 977 ms, dashboard 1,226 ms, employee report 1,296 ms.

### What was tuned
- Indexes on `leads(category)`, `leads(city)`, `leads(in_reactivation)`, `leads(stage_id, win_prob, expected_revenue)` and `calls(started_at)` — the filter dropdowns went from 60–90 ms to under 1 ms, pipeline totals 99 → 21 ms, forecast 70 → 19 ms.
- DB connection pool 10 → 20 (`DB_POOL_SIZE`), since each page runs its queries in parallel.

### Known ceilings (next steps if volumes grow)
- **Dashboard / employee report** aggregate the whole date range on every load. At ~1 M leads, cache them for 1–5 minutes or keep daily summary tables.
- **Search** uses `LIKE '%term%'` over five columns (≈100 ms at 100 k rows). Beyond ~500 k leads add a FULLTEXT index or a search service.
- Hourly **scoring** recomputes every open lead in one pass; at ~1 M open leads switch to incremental updates.
- Run the database on its own server/managed instance in production; this test shared one laptop.
