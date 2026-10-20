# Action execution and performance

Nile binds a reusable executor to each registered action at engine creation. Execution selects the executor using service/action maps without creating an intermediate lookup Result. This does not generate code or freeze action configuration.

Handlers, validation schemas and local hooks remain live: changing an existing registered action affects subsequent execution. Hook reads stay at their original points in the pipeline, including after hooks added by the main handler during the same call. Global before/after callbacks are captured at the beginning of each execution, as before.

The phase order remains authentication, global before, local before, validation, handler, local after, global after, and optional pipeline response. Handler execution still uses slang-ts safeTry, including recursive Result unwrapping and thrown/rejected error handling. Unchanged output reuses its normalized Result instead of constructing another wrapper; public Result methods remain available.

Each execution still receives an isolated child request scope, including nested/direct engine calls. Hook state stays eagerly allocated because lazy getters measured slower locally. Global middleware remains registered to support late middleware registration on both Nile and custom Hono routes; the empty/nonmatching path passes through without an additional async wrapper.

Registration timing includes binding executors. These changes reduce overhead; they do not establish a fastest-framework claim. See the benchmark evidence for measured results and limitations.
