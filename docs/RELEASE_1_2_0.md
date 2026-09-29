# Ability 1.2.0

Use Kujo 1.6.0 or newer. This release exports the v2 portable definition digest and distributes the application assurance profile, portable vectors and local HTTP/OpenAPI controlled integration. Stable `kujo.ability/v1` and existing receipt semantics remain unchanged.

Wave C beta stays experimental, opt-in and limited to the single-effect required/deny domain, with alpha retained. Controlled HTTP interoperability stays alpha under a trusted local host. Dispatch alone decides replay; host/application code owns authentication, authorization, business commits and receipts. No remote trust, exactly-once, universal rollback or production gateway service is claimed. The TypeScript/Python previews remain unpublished.

Install with `kennel add ability@1.2.0` followed by `kennel install`. Commit the exact generated lockfile. The canonical Kujo/TypeScript/Python contracts, consumer/Fence gate, application gateway and HTTP failure/concurrency tests are release gates.
