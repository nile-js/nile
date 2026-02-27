---
title: Architecture
description: Internal architecture, design decisions, and component interactions of Dialogue
---

# Dialogue Architecture

This document describes the internal architecture, design decisions, and component interactions of the Dialogue real-time communication library.

## 1. Overview

Dialogue is an event-based realtime communication library built on Socket.IO and Hono, supporting both Bun and Node.js runtimes. The architecture prioritizes simplicity, type safety, and predictable behavior over flexibility.

### 1.1 Core Philosophy

- **Config-first**: All rooms and events defined upfront in one file
- **Event-centric**: Events are first-class citizens, not just message payloads
- **Bounded rooms**: Optional `maxSize` for predictable scaling
- **Same mental model**: Frontend and backend share similar patterns
- **Extensible**: Designed for future SSE, Web Push, and FCM channels

### 1.2 Technology Stack

- **Bun / Node.js**: Supported JavaScript runtimes (auto-detected)
- **Socket.IO**: WebSocket abstraction with fallbacks
- **Hono**: Lightweight HTTP framework
- **Zod**: Runtime schema validation
- **slang-ts**: Result pattern utilities (`Ok`, `Err`, `Result`)
- **@hono/node-server**: Bridges Hono's fetch API to Node.js `http.createServer()` (Node runtime only)
- **@socket.io/bun-engine**: Socket.IO engine adapter for Bun (Bun runtime only)

## 2. System Architecture

### 2.1 High-Level Component Diagram

```
+------------------+     WebSocket      +------------------+
|                  | <----------------> |                  |
|  DialogueClient  |    Socket.IO       |     Dialogue     |
|    (Frontend)    |                    |     (Backend)    |
|                  |                    |                  |
+------------------+                    +------------------+
        |                                       |
        v                                       v
+------------------+                    +------------------+
|   RoomContext    |                    |   RoomManager    |
|   (per room)     |                    |   (coordinator)  |
+------------------+                    +------------------+
                                                |
                                    +-----------+-----------+
                                    |           |           |
                                    v           v           v
                                +-------+   +-------+   +-------+
                                | Room  |   | Room  |   | Room  |
                                | chat  |   | orders|   |  ...  |
                                +-------+   +-------+   +-------+
```

### 2.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| `Dialogue` | Main API surface, coordinates rooms, triggers events |
| `RoomManager` | Tracks all rooms and their participants |
| `Room` | Manages participants, subscriptions, event broadcasting |
| `ConnectedClient` | Wraps socket with user context and subscriptions |
| `DialogueClient` | Frontend client factory for connecting and joining rooms |
| `RoomContext` | Frontend room handle for triggering and listening |

## 3. Backend Architecture

### 3.1 Module Structure

```
dialogue/
  types.ts           # Type definitions (interfaces, no implementation)
  define-event.ts    # Event definition factory with Zod validation
  room.ts            # Room creation and room manager
  client-handler.ts  # Connected client wrapper
  server.ts          # Socket.IO + Hono server setup (runtime-agnostic)
  create-dialogue.ts # Main factory function
  index.ts           # Barrel exports
  adapters/
    types.ts         # RuntimeAdapter interface, Runtime type
    bun-adapter.ts   # Bun.serve() + @socket.io/bun-engine
    node-adapter.ts  # http.createServer() + @hono/node-server
    index.ts         # detectRuntime() + createRuntimeAdapter()
```

### 3.2 Initialization Flow

When `createDialogue(config)` is called:

```
1. createDialogue(config)
   |
   +--> Create or use existing Hono app
   |
   +--> createRuntimeAdapter(config.runtime)
   |    |
   |    +--> detectRuntime() if not specified
   |    |    (checks globalThis.Bun, falls back to "node")
   |    |
   |    +--> Return BunAdapter or NodeAdapter
   |
   +--> setupServer(app, config, adapter)
        |
        +--> Create Socket.IO server
        |
        +--> adapter.bind(io)
        |    (Bun: BunEngine, Node: deferred to start)
        |
        +--> createRoomManager(io)
        |    |
        |    +--> For each room in config:
        |         roomManager.register(id, config)
        |
        +--> Set up connection handler
        |    |
        |    +--> io.on("connection", ...)
        |
        +--> Return { io, roomManager, start, stop }
   |
   +--> Return Dialogue instance
```

### 3.3 Room Manager

The `RoomManager` is the central coordinator for all rooms. It maintains two parallel maps:

```typescript
const rooms = new Map<string, Room>();
const roomParticipants = new Map<string, Map<string, ConnectedClient>>();
```

**Why two maps?**

The `Room` instance is immutable after creation. Participant tracking is handled separately in `roomParticipants` to allow the room manager to enforce capacity limits across all operations.

### 3.4 Event Flow (Server-Side Trigger)

When `dialogue.trigger(roomId, event, data)` is called:

```
1. dialogue.trigger(roomId, event, data)
   |
   +--> roomManager.get(roomId)
   |
   +--> room.trigger(event, data, from)
        |
        +--> isEventAllowed(event.name, config.events)
        |
        +--> validateEventData(eventDef, data)  [Zod validation]
        |
        +--> Create EventMessage envelope
        |    {
        |      event: "message",
        |      roomId: "chat",
        |      data: { text: "Hello" },
        |      from: "user-123",
        |      timestamp: 1707750000000
        |    }
        |
        +--> io.to(roomId).emit("dialogue:event", message)
        |
        +--> Call all registered event handlers
```

### 3.5 Event Flow (Client-Triggered)

When a client triggers an event via WebSocket:

```
1. Client emits "dialogue:trigger" { roomId, event, data }
   |
   +--> Server validates roomId and event name
   |
   +--> roomManager.get(roomId)
   |
   +--> Check if event is allowed in room
   |
   +--> room.trigger(eventDef, data, client.userId)
        |
        +--> [Same flow as server-side trigger]
```

## 4. Client Architecture

### 4.1 Module Structure

```
client/
  types.ts            # Client-side type definitions
  dialogue-client.ts  # Main DialogueClient class
  room-context.ts     # RoomContext factory
  index.ts            # Barrel exports
```

### 4.2 Connection Flow

```
1. createDialogueClient({ url, auth })
   |
   +--> Create socket.io-client instance
   |
   +--> Connect with auth in handshake
   |
   +--> Wait for "dialogue:connected" event
   |
   +--> Extract userId from response
   |
   +--> Set connected = true
```

### 4.3 Room Join Flow

```
1. client.join("chat")
   |
   +--> socket.emit("dialogue:join", { roomId: "chat" })
   |
   +--> Wait for "dialogue:joined" event
   |
   +--> createRoomContext(socket, roomId, roomName)
   |
   +--> Return RoomContext
```

### 4.4 RoomContext Event Handling

The `RoomContext` listens for `dialogue:event` messages and filters by room:

```typescript
socket.on("dialogue:event", (msg) => {
  if (msg.roomId !== roomId) return;
  
  // Call specific event handlers
  const handlers = eventHandlers.get(msg.event);
  if (handlers) {
    handlers.forEach(h => h(msg));
  }
  
  // Call wildcard handlers
  anyHandlers.forEach(h => h(msg.event, msg));
});
```

## 5. Wire Protocol

### 5.1 Socket.IO Events

All events are prefixed with `dialogue:` to avoid conflicts.

**Client to Server:**

| Event | Payload | Description |
|-------|---------|-------------|
| `dialogue:join` | `{ roomId }` | Request to join room |
| `dialogue:leave` | `{ roomId }` | Request to leave room |
| `dialogue:subscribe` | `{ roomId, eventName }` | Subscribe to event |
| `dialogue:subscribeAll` | `{ roomId }` | Subscribe to all events |
| `dialogue:unsubscribe` | `{ roomId, eventName }` | Unsubscribe from event |
| `dialogue:trigger` | `{ roomId, event, data }` | Trigger event |
| `dialogue:listRooms` | (none) | Request room list |

**Server to Client:**

| Event | Payload | Description |
|-------|---------|-------------|
| `dialogue:connected` | `{ clientId, userId }` | Connection established |
| `dialogue:joined` | `{ roomId, roomName }` | Successfully joined room |
| `dialogue:left` | `{ roomId }` | Successfully left room |
| `dialogue:event` | `EventMessage` | Event broadcast |
| `dialogue:rooms` | `RoomInfo[]` | Room list response |
| `dialogue:error` | `{ code, message }` | Error notification |

### 5.2 EventMessage Envelope

All events are wrapped in a consistent envelope:

```typescript
interface EventMessage<T> {
  event: string;      // Event name (e.g., "message")
  roomId: string;     // Room ID (e.g., "chat")
  data: T;            // Event payload
  from: string;       // Sender's userId
  timestamp: number;  // Unix timestamp in milliseconds
}
```

## 6. Design Decisions

### 6.1 Config-First with Dynamic Creation

Dialogue is designed with a **config-first philosophy** while supporting dynamic room creation for flexibility.

#### Recommended Approach (80/20 Rule)

**80% Predefined Rooms** (config-first):
```typescript
const dialogue = createDialogue({
  rooms: [
    { id: 'lobby', name: 'Main Lobby', events: [...] },
    { id: 'notifications', name: 'Notifications', events: [...] },
    { id: 'support', name: 'Support Chat', events: [...] }
  ]
});
```

**Benefits:**
- Type safety and validation at startup
- Clear system architecture
- Predictable resource usage
- Better documentation

**20% Dynamic Rooms** (runtime creation):
```typescript
// User creates a game room
dialogue.createRoom({
  id: `game-${gameId}`,
  name: `Game ${gameId}`,
  events: gameEvents
});

// Clean up when done
dialogue.deleteRoom(`game-${gameId}`);
```

**Use for:**
- User-generated content (custom game rooms, DMs)
- Temporary sessions (video calls, screen shares)
- Per-entity rooms (document editing, ticket threads)

#### Hybrid Example

```typescript
// Predefined: System-wide rooms
const systemRooms = [
  { id: 'global-chat', name: 'Chat', events: [chatEvent] },
  { id: 'notifications', name: 'Notifications', events: [notifEvent] }
];

const dialogue = createDialogue({ rooms: systemRooms });

// Dynamic: User-specific rooms
app.post('/games', async (c) => {
  const gameId = nanoid();
  
  dialogue.createRoom({
    id: `game-${gameId}`,
    name: 'Game Session',
    events: [moveEvent, scoreEvent],
    maxSize: 4
  });
  
  return c.json({ gameId });
});
```

#### When to Use Each

| Use Case | Approach | Example |
|----------|----------|---------|
| System-wide features | Predefined | Notifications, global chat |
| Known room types | Predefined | Support channels, lobbies |
| User-generated | Dynamic | Private DMs, custom games |
| Temporary sessions | Dynamic | Video calls, collaborations |
| Per-entity rooms | Dynamic | Document editing, tickets |

**Key principle:** If you know the room type at build time, define it in config. If it's created by user actions, create it dynamically.

### 6.2 Why Event-Centric?

**Problem**: Generic "message" events require runtime type checking and are error-prone.

**Solution**: First-class event definitions with optional Zod schemas:

```typescript
const Message = defineEvent("message", {
  schema: z.object({
    text: z.string(),
    senderId: z.string()
  })
});
```

Benefits:

- Compile-time type inference
- Runtime validation
- Self-documenting code
- IDE autocomplete

### 6.3 Why Bounded Rooms?

**Problem**: Unbounded rooms can grow indefinitely, causing memory issues and performance degradation.

**Solution**: Optional `maxSize` configuration:

```typescript
rooms: {
  chat: {
    name: "Support Chat",
    maxSize: 50,  // Enforced at join time
    events: [Message]
  }
}
```

### 6.4 Why Separate RoomManager?

**Problem**: Rooms need to track participants, but participant state must be consistent across the system.

**Solution**: The `RoomManager` owns participant state in a separate map, ensuring:

- Consistent capacity enforcement
- Single source of truth for participants
- Clean separation between room definition and runtime state

### 6.5 Why Socket.IO Over Raw WebSockets?

**Advantages**:

- Automatic reconnection
- Fallback transports (polling)
- Built-in room abstraction
- Mature, well-tested library
- Easy integration with existing infrastructure

**Trade-offs**:

- Larger bundle size
- Additional protocol overhead
- Less control over low-level behavior

### 6.6 Why a Runtime Adapter Pattern?

**Problem**: Dialogue was originally hard-coupled to Bun via `Bun.serve()` and `@socket.io/bun-engine`. This prevented usage with Node.js.

**Solution**: A `RuntimeAdapter` interface that abstracts the three runtime-specific touch points:

1. **Engine binding** — Bun needs `@socket.io/bun-engine`, Node uses Socket.IO's built-in `engine.io`
2. **HTTP server startup** — Bun uses `Bun.serve()`, Node uses `http.createServer()` with `@hono/node-server`
3. **Server shutdown** — Each runtime has its own cleanup mechanism

```typescript
interface RuntimeAdapter {
  readonly runtime: Runtime;
  bind(io: Server): void;
  start(options: RuntimeStartOptions): Promise<void>;
  stop(): Promise<void>;
}
```

The adapter is selected automatically via `detectRuntime()` (which checks `globalThis.Bun`) or explicitly via the `runtime` config option. All other Dialogue code (rooms, events, hooks, client handling) is runtime-agnostic.

## 7. Data Flow Diagrams

### 7.1 Client Sends Message

```
DialogueClient         Socket.IO          Dialogue           Room
     |                     |                  |                |
     | trigger("message",  |                  |                |
     |   { text: "Hi" })   |                  |                |
     |-------------------->|                  |                |
     |                     | dialogue:trigger |                |
     |                     |----------------->|                |
     |                     |                  | room.trigger() |
     |                     |                  |--------------->|
     |                     |                  |                |
     |                     |                  |  validate()    |
     |                     |                  |<---------------|
     |                     |                  |                |
     |                     |  io.to(roomId)   |                |
     |                     |     .emit()      |                |
     |                     |<-----------------|                |
     |  dialogue:event     |                  |                |
     |<--------------------|                  |                |
     |                     |                  |                |
```

### 7.2 Server Broadcasts Event

```
API Route              Dialogue           Room           Clients
     |                    |                |                |
     | trigger("orders",  |                |                |
     |   OrderUpdated,    |                |                |
     |   { status: ... }) |                |                |
     |------------------->|                |                |
     |                    | room.trigger() |                |
     |                    |--------------->|                |
     |                    |                |                |
     |                    |                | validate()     |
     |                    |                |                |
     |                    |  io.to(roomId) |                |
     |                    |     .emit()    |                |
     |                    |--------------->|--------------->|
     |                    |                |                |
```

## 8. Security Considerations

### 8.1 Authentication

Authentication is handled via Socket.IO handshake:

```typescript
const client = createDialogueClient({
  url: "ws://localhost:3000",
  auth: { token: "user-jwt-token" }
});
```

The server extracts user identity in `extractUserFromSocket()`:

```typescript
export function extractUserFromSocket(socket: Socket) {
  const auth = socket.handshake.auth;
  // Extract userId from token or auth payload
  // Return { userId, meta }
}
```

### 8.2 Event Validation

All events with Zod schemas are validated before broadcasting. Validation returns a `Result<T, string>` using the slang-ts pattern:

```typescript
const validation = validateEventData(eventDef, data);
if (validation.isErr) {
  // Reject invalid data - validation.error contains the error message
  return;
}
// validation.value contains the validated data
```

### 8.3 Room Access Control

Room access can be controlled in the `onConnect` handler:

```typescript
onConnect: (client) => {
  if (client.meta.role === "admin") {
    client.join("admin-room");
  }
}
```

## 9. Scalability Considerations

### 9.1 Current Limitations

- Single server instance only
- In-memory participant tracking
- No persistence layer

### 9.2 Future Scaling Options

**Horizontal Scaling**: Add Redis adapter for multi-instance:

```typescript
// Future API (not implemented)
import { createRedisAdapter } from "dialogue/adapters/redis";

const dialogue = createDialogue({
  adapter: createRedisAdapter({ host: "localhost", port: 6379 }),
  // ...
});
```

**Persistence Layer**: Add event persistence interface:

```typescript
// Future API (not implemented)
const dialogue = createDialogue({
  persistence: {
    saveEvent: (msg) => db.events.insert(msg),
    loadEvents: (roomId, limit) => db.events.find({ roomId }).limit(limit)
  }
});
```

## 10. Performance Characteristics

### 10.1 Memory Usage

- Each connected client: ~1-2 KB (socket + metadata)
- Each room: ~200 bytes + participants
- Event handlers: ~100 bytes per handler

### 10.2 Message Latency

- Local (same machine): < 1ms
- Network: RTT + ~1-2ms processing

### 10.3 Throughput

- Depends on Bun/Node event loop
- Socket.IO overhead: ~5-10% vs raw WebSockets
- Zod validation: ~0.1ms per event (for typical payloads)

## 11. Extension Points

### 11.1 Custom Authentication

Override `extractUserFromSocket()` for custom auth strategies:

```typescript
// Verify JWT, check database, etc.
export function extractUserFromSocket(socket: Socket) {
  const token = socket.handshake.auth.token;
  const user = verifyJWT(token);
  return { userId: user.id, meta: { role: user.role } };
}
```

### 11.2 Event Middleware (Future)

Planned middleware pipeline for events:

```typescript
// Future API (not implemented)
dialogue.use("chat", (msg, next) => {
  // Rate limiting, content filtering, etc.
  if (isSpam(msg)) return;
  next();
});
```

### 11.3 Additional Channels (Future)

Planned support for alternative delivery channels:

- **SSE**: Server-sent events for one-way server to client
- **Web Push**: Push notifications via FCM/APNS
- **HTTP Polling**: For environments without WebSocket support
*This specification reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
