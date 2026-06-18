# Elasticsearch Decision

## Decision

Remove Elasticsearch and use PostgreSQL 16 full-text search plus `pg_trgm` for the product catalog.

This decision is sized for Balican's expected near-term catalog of fewer than 100,000 products. PostgreSQL is already the system of record, is required for every request, and can support the current query patterns without a second datastore, asynchronous indexing, or a separate recovery process.

## Current Usage Inventory

| Usage | Previous behavior | Failure without Elasticsearch | PostgreSQL equivalent |
| --- | --- | --- | --- |
| Public product search | Fuzzy match on product name, optional description match, category/subcategory filters, score then recency ordering | `GET /api/products?search=...` returned 500; there was no fallback | Weighted full-text rank plus trigram similarity and substring fallback, with the same filters and pagination |
| Product create/update/delete | Fire-and-forget writes to a denormalized product index | Database write succeeded but the search index became stale | No synchronization step; searches read committed product rows directly |
| Bulk product import | One index request per imported product | Import succeeded while search silently became stale | No synchronization step |
| Startup index creation | Attempted to create product and analytics indices, then logged a degraded warning | API started, but the core product search path remained broken | Canonical PostgreSQL migration creates extensions, indexes, and analytics storage |
| Search tracking | Stored query, result count, IP, and timestamp in an analytics index | Public tracking returned 500 | `product_analytics_events` append-only table |
| Product-view tracking | Stored product ID/name, IP, and timestamp in an analytics index | Public tracking returned 500 | `product_analytics_events` append-only table |
| Admin analytics | Elasticsearch terms and date-histogram aggregations | Three admin endpoints returned 500 | `GROUP BY`, `COUNT`, and `MAX` queries preserving existing response fields |

No recommendation, Scout, provider, procurement, or marketplace-service search depends on Elasticsearch. Those flows already use PostgreSQL `ILIKE` queries.

## Query And Scale Assumptions

- Fewer than 100,000 products during the current operating horizon.
- Search fields: product name, short description, description, and SKU.
- Filters: active state and a category subtree or exact subcategory.
- Pagination is offset-based and normally returns 20 rows.
- Typo tolerance is most important for product names; `pg_trgm` covers this without applying an expensive trigram index to long descriptions.
- Search analytics volume is modest and append-only. Composite partial indexes cover the existing admin reports.

The replacement uses a GIN expression index on the English `tsvector` and a GIN trigram index on product names. Results rank full-text relevance plus name similarity, then featured status and recency. A substring fallback preserves useful behavior for short terms and partial model names.

## Options Considered

### Operate Elasticsearch

Required work included adding a production service or managed cluster, authentication and TLS, memory sizing, persistent storage, snapshots, restore testing, index aliases, monitoring, drift repair, and a reliable rebuild runbook. The existing production Compose file did not run Elasticsearch even though the README said it did. Product writes were asynchronous and could leave the index stale indefinitely.

Even a single-node deployment would reserve roughly 512 MB or more of heap plus filesystem cache. It would also add another stateful backup and incident surface for one catalog query and three small analytics reports.

### Consolidate On PostgreSQL

Required work was one canonical migration, a focused search service, SQL analytics queries, and removal of asynchronous indexing. PostgreSQL already owns the source data, backup policy, readiness check, and production operating knowledge.

## Why PostgreSQL Wins

1. Product search no longer depends on an optional service that production does not provision.
2. Search results cannot drift from catalog writes.
3. One stateful system reduces memory, backup, monitoring, security, and recovery work.
4. The current scale and query complexity do not justify distributed search infrastructure.
5. The API and frontend contracts remain unchanged.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Ranking differs from Elasticsearch | Integration tests cover exact, typo, description, active-state, hierarchy, and pagination behavior; ranking can be tuned in one SQL expression |
| Search queries compete with transactional traffic | GIN indexes constrain scans; monitor query latency and database CPU before changing architecture |
| Analytics table grows indefinitely | Time/type index supports reports; add retention or partitioning only when measured volume warrants it |
| English stemming mishandles catalog codes | SKU and partial-name substring matching bypass stemming; trigram similarity handles misspellings |

## Revisit Triggers

Reconsider a dedicated search engine only when measurements show PostgreSQL cannot meet the product-search SLO after query/index tuning, or when requirements add capabilities such as multi-million-item catalogs, faceting across many dimensions, language-specific analyzers, search-as-you-type at high sustained concurrency, or vector/hybrid retrieval. The trigger must be production evidence, not anticipated scale.

## Rollback Boundary

The migration is additive and does not alter product rows. Rolling back application code can restore the former Elasticsearch client, but new PostgreSQL analytics events would need an explicit export if historical continuity in Elasticsearch were required. The GIN indexes and analytics table may remain safely in place during rollback.
