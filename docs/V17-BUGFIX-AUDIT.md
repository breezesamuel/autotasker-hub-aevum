# V17 Bug Fix Audit — 2026-11-16

## Bugs Found & Fixed

### BUG-1 [Critical] oss-productize.js classifyStrategy always returned ['mcp_bridge']
**Root cause**: `STRATEGIES` object had no `recommendedFor` field, so `(s.recommendedFor||[]).includes(cat)` always returned false → `matches.length === 0` → always fell back to `['mcp_bridge']`.
**Impact**: Every OSS tool was packaged as an MCP bridge regardless of language/category. Python ML models were classified as JS MCP bridges, Go CLI tools were mis-categorized. Pricing recommendations were wrong.
**Fix**: Added explicit `recommendedFor` arrays to each STRATEGY entry matching relevant categories.
**Verified**: ml-nlp/python → inference_service ✓, cli-tools/go → cli_wrapper ✓, data-viz/js → mcp_bridge/scheduled_export ✓

### BUG-2 oss-discovery.js classifyLicense missed SPDX variants
**Root cause**: Direct Set lookup against raw spdx_id without normalization. Missed:
- `-only`/`-or-later` suffixes (`GPL-3.0-only`, `GPL-3.0-or-later`)
- Compound licenses (`MIT OR Apache-2.0`, `GPL-2.0 WITH Classpath-exception-2.0`)
- Case variations and trailing whitespace
**Impact**: Valid Whitelist licenses like `GPL-3.0-only` classified as `unknown` instead of `yellow`; compound permissive licenses could fall through to `red`.
**Fix**: Added `normalizeSpdx()` function that strips suffixes, normalizes separators, handles compound licenses by recursive classification.

### BUG-3 GitHub search query syntax errors
**Root cause**: Query strings had malformed operators:
- `language:shell OR language:bash org:xclipit` — missing grouping parentheses and quotes around org value
- `star:>1000` — typo, should be `stars:>1000`
- Multi-value OR clauses not properly grouped
**Impact**: Some categories returned zero results or wrong result sets.
**Fix**: Quoted all multi-word values, added proper `(A OR B OR C)` grouping, fixed `star:` → `stars:` typo.

### BUG-4 paginateSearch not exported from module
**Root cause**: `async function* paginateSearch` defined but not in `module.exports`.
**Impact**: External callers couldn't iterate search results directly (minor — only affects testing/debugging).
**Fix**: Added to module.exports.

### BUG-5 License tier Sets incomplete
**Root cause**: TIER_WHITELIST missing common permissive licenses (zlib, X11, PostgreSQL, BSL-1.0, Artistic-2.0).
**Impact**: Some legitimately permissive tools classified as `unknown` instead of `white`.
**Fix**: Extended TIER_WHITELIST with additional recognized permissive licenses.

### BUG-6 Rate limit handling silent failures
**Root cause**: `ghGet` didn't check `X-RateLimit-Remaining` header — would hit 403 and resolve silently with `null`.
**Impact**: Discovery scan could appear to succeed while actually returning zero results after rate limit exhaustion.
**Fix**: Added rate-limit aware logic: warn when remaining < 10, wait until reset time, log first response headers.

### BUG-7 Concurrent error handling
**Root cause**: `paginateSearch` had no consecutive-error tracking — a single transient 500 would propagate ungracefully.
**Fix**: Added `consecutiveErrors` counter with auto-abort after 3 failures per query.

## Verification Results
- classifyLicense: 15/15 edge cases passed (MIT, Apache-2.0, GPL variants, compound licenses, null, empty, proprietary)
- classifyStrategy: 5/5 categories correctly mapped (cli-tools→cli_wrapper, ml-nlp→inference_service, security→cli_wrapper, data-viz→mcp_bridge, productivity→cli_wrapper)
- GitHub search: 30 results yielded from test query (security/language:go stars:>500) — valid repos confirmed
- Productize packageAll: W=2 Y=1 R=0 correct counts, strategies breakdown matches expectations
- All existing test suites still green (v13b 26/26, v14 21/21, v14b 19/19, v16 23/23, smoke PASS)
- Syntax check: 0 files with errors
