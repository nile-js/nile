---
title: Roadmap
description: Planned features and improvements for future versions of Dialogue
---

# Dialogue Roadmap

This document outlines planned features and improvements for future versions of Dialogue. These features are not currently implemented but represent the direction of the library.

## 1. Overview

Dialogue is designed to be extensible beyond WebSocket-based real-time communication. The following features are planned to expand its capabilities while maintaining the config-first, event-centric philosophy.

## 2. Planned Features

### 2.1 SSE Channel

**Priority:** High  
**Status:** Planned

Server-Sent Events (SSE) for one-way server-to-client communication. Useful for scenarios where clients only need to receive updates without sending data.

**Use Cases:**

- Live feeds (news, stock prices)
- Progress updates for long-running operations
- Notification streams

**Proposed API:**

```typescript
const dialogue = createDialogue({
  channels: {
    sse: {
      enabled: true,
      path: '/events'
    }
  },
  rooms: {
    feed: {
      name: 'Live Feed',
      events: [NewPost],
      channels: ['sse', 'websocket']  // Broadcast to multiple channels
    }
  }
})
```

### 2.2 Web Push Channel

**Priority:** Medium  
**Status:** Planned

Push notifications via FCM (Firebase Cloud Messaging) and APNS (Apple Push Notification Service) for reaching users when they're not connected.

**Use Cases:**

- Mobile app notifications
- Browser push notifications
- Offline message delivery

**Proposed API:**

```typescript
const dialogue = createDialogue({
  channels: {
    webpush: {
      fcm: { serverKey: process.env.FCM_KEY },
      apns: { keyFile: './apns-key.p8' }
    }
  },
  rooms: {
    alerts: {
      name: 'Critical Alerts',
      events: [Alert],
      channels: ['webpush', 'websocket']
    }
  }
})

// Register device token
client.registerPushToken('fcm', deviceToken)
```

### 2.3 Persistence Layer

**Priority:** High  
**Status:** Planned

Interface for persisting events and room state. Enables message history, offline sync, and audit trails.

**Use Cases:**

- Chat message history
- Event replay for late joiners
- Audit logging

**Proposed API:**

```typescript
const dialogue = createDialogue({
  persistence: {
    adapter: createRedisAdapter({ url: process.env.REDIS_URL }),
    // Or custom adapter
    // adapter: {
    //   saveEvent: (msg) => db.events.insert(msg),
    //   loadEvents: (roomId, opts) => db.events.find({ roomId }).limit(opts.limit),
    //   saveRoomState: (roomId, state) => db.rooms.upsert({ id: roomId, state })
    // },
    retention: {
      maxEvents: 1000,
      maxAge: '7d'
    }
  }
})

// Sync history to new client
onConnect: async (client) => {
  const history = await dialogue.getHistory('chat', { limit: 50 })
  client.send('sync', history)
}
```

### 2.4 Horizontal Scaling

**Priority:** High  
**Status:** Planned

Redis adapter for multi-instance deployments. Allows running multiple Dialogue servers behind a load balancer.

**Use Cases:**

- High availability
- Load distribution
- Geographic distribution

**Proposed API:**

```typescript
import { createRedisAdapter } from 'dialogue-ts/adapters/redis'

const dialogue = createDialogue({
  adapter: createRedisAdapter({
    host: 'localhost',
    port: 6379,
    // Or cluster mode
    // nodes: [{ host: 'node1', port: 6379 }, { host: 'node2', port: 6379 }]
  }),
  rooms: { ... }
})
```

### 2.5 Rate Limiting

**Priority:** Medium  
**Status:** Planned

Per-client event rate limiting to prevent abuse and ensure fair resource usage.

**Use Cases:**

- Spam prevention
- API quota enforcement
- DoS protection

**Proposed API:**

```typescript
const dialogue = createDialogue({
  rateLimit: {
    global: {
      maxEvents: 100,
      window: '1m'
    },
    perRoom: {
      chat: {
        maxEvents: 10,
        window: '1s'
      }
    }
  }
})
```

### 2.6 Event Middleware

**Priority:** Medium  
**Status:** Planned

Middleware pipeline for processing events before they're broadcast. Enables logging, filtering, transformation, and authorization.

**Use Cases:**

- Content moderation
- Event transformation
- Authorization checks
- Logging and analytics

**Proposed API:**

```typescript
const dialogue = createDialogue({
  middleware: [
    // Global middleware
    loggerMiddleware(),
    rateLimitMiddleware()
  ],
  rooms: {
    chat: {
      name: 'Chat',
      events: [Message],
      middleware: [
        // Room-specific middleware
        contentFilterMiddleware({ blocklist: ['spam'] }),
        authMiddleware({ requiredRole: 'member' })
      ]
    }
  }
})

// Custom middleware
function contentFilterMiddleware(opts) {
  return (msg, next) => {
    if (containsBlockedContent(msg.data, opts.blocklist)) {
      return  // Block event
    }
    next()  // Continue pipeline
  }
}
```

### 2.7 Metrics and Observability

**Priority:** Low  
**Status:** Planned

Export connection and event metrics for monitoring and alerting.

**Use Cases:**

- Performance monitoring
- Capacity planning
- Debugging

**Proposed API:**

```typescript
const dialogue = createDialogue({
  metrics: {
    enabled: true,
    format: 'prometheus',  // or 'statsd', 'custom'
    endpoint: '/metrics'
  }
})

// Exported metrics:
// dialogue_connections_total
// dialogue_connections_active
// dialogue_events_total{room, event}
// dialogue_events_latency_seconds{room, event}
// dialogue_rooms_size{room}
```

## 3. Implementation Timeline

| Feature | Target Version | Priority |
|---------|----------------|----------|
| Persistence Layer | v1.1 | High |
| Horizontal Scaling | v1.1 | High |
| SSE Channel | v1.2 | High |
| Rate Limiting | v1.2 | Medium |
| Event Middleware | v1.3 | Medium |
| Web Push Channel | v1.4 | Medium |
| Metrics | v1.5 | Low |

## 4. Breaking Changes Policy

- Major versions (2.0, 3.0) may include breaking changes
- Minor versions (1.1, 1.2) will maintain backward compatibility
- Deprecations will be announced one minor version before removal
- Migration guides will be provided for breaking changes

## 5. Contributing

We welcome contributions for these planned features. Before starting work:

1. Open an issue to discuss the implementation approach
2. Review existing code patterns and conventions
3. Write tests for new functionality
4. Update documentation
*This roadmap reflects current plans and is subject to change based on community feedback and priorities. Contributions and feedback are welcome.*
