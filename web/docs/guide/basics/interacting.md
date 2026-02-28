# Interacting with Nile

Nile exposes a single HTTP endpoint for all interactions. All requests are POST requests with a JSON body that specifies the `intent`, `service`, `action`, and `payload`.

## The Single Endpoint

```
POST {baseUrl}/services
```

The default base URL is `/api`, so the full endpoint is typically:
```
POST /api/services
```

## Request Format

Every request follows this structure:

```json
{
  "intent": "explore" | "execute" | "schema",
  "service": "serviceName",
  "action": "actionName",
  "payload": { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `intent` | `string` | What you want to do: `explore`, `execute`, or `schema` |
| `service` | `string` | The service name, or `"*"` for wildcard |
| `action` | `string` | The action name, or `"*"` for wildcard |
| `payload` | `object` | The input data for the action |

## Intents

### 1. Execute (`intent: "execute"`)

Execute an action. This is the most common intent for running your business logic.

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "execute",
    "service": "tasks",
    "action": "create",
    "payload": { "title": "Buy milk", "status": "pending" }
  }'
```

**Response:**
```json
{
  "status": true,
  "message": "Action 'tasks.create' executed",
  "data": {
    "task": {
      "id": "abc-123",
      "title": "Buy milk",
      "status": "pending"
    }
  }
}
```

### 2. Explore (`intent: "explore"`)

Discover available services and actions. Use wildcards to explore.

**List all services:**

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "explore",
    "service": "*",
    "action": "*",
    "payload": {}
  }'
```

**Response:**
```json
{
  "status": true,
  "message": "Available services",
  "data": [
    {
      "name": "tasks",
      "description": "Task management operations",
      "meta": { "version": "1.0.0" },
      "actions": ["create", "list", "get", "update", "delete"]
    },
    {
      "name": "auth",
      "description": "Authentication service",
      "actions": ["login", "logout", "register"]
    }
  ]
}
```

**List all actions in a service:**

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "explore",
    "service": "tasks",
    "action": "*",
    "payload": {}
  }'
```

**Response:**
```json
{
  "status": true,
  "message": "Actions for 'tasks'",
  "data": [
    {
      "name": "create",
      "description": "Create a new task",
      "isProtected": false,
      "validation": true,
      "accessControl": []
    },
    {
      "name": "list",
      "description": "List all tasks",
      "isProtected": false,
      "validation": false,
      "accessControl": []
    },
    {
      "name": "get",
      "description": "Get a task by ID",
      "isProtected": true,
      "validation": true,
      "accessControl": []
    }
  ]
}
```

**Get details of a specific action:**

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "explore",
    "service": "tasks",
    "action": "create",
    "payload": {}
  }'
```

**Response:**
```json
{
  "status": true,
  "message": "Details for 'tasks.create'",
  "data": {
    "name": "create",
    "description": "Create a new task",
    "isProtected": false,
    "accessControl": null,
    "hooks": {
      "before": [],
      "after": []
    },
    "meta": null
  }
}
```

### 3. Schema (`intent: "schema"`)

Get the Zod validation schemas as JSON Schema. Useful for generating type-safe clients.

**Get all schemas:**

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "schema",
    "service": "*",
    "action": "*",
    "payload": {}
  }'
```

**Response:**
```json
{
  "status": true,
  "message": "All service schemas",
  "data": {
    "tasks": {
      "create": {
        "type": "object",
        "properties": {
          "title": { "type": "string", "minLength": 1 },
          "status": { "type": "string", "enum": ["pending", "in-progress", "done"] }
        },
        "required": ["title"]
      },
      "list": null,
      "get": {
        "type": "object",
        "properties": {
          "id": { "type": "string" }
        },
        "required": ["id"]
      }
    },
    "auth": {
      "login": {
        "type": "object",
        "properties": {
          "email": { "type": "string", "format": "email" },
          "password": { "type": "string" }
        },
        "required": ["email", "password"]
      }
    }
  }
}
```

**Get schemas for a specific service:**

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "schema",
    "service": "tasks",
    "action": "*",
    "payload": {}
  }'
```

**Response:**
```json
{
  "status": true,
  "message": "Schemas for 'tasks'",
  "data": {
    "create": {
      "type": "object",
      "properties": {
        "title": { "type": "string", "minLength": 1 },
        "status": { "type": "string", "enum": ["pending", "in-progress", "done"] }
      },
      "required": ["title"]
    },
    "list": null,
    "get": {
      "type": "object",
      "properties": {
        "id": { "type": "string" }
      },
      "required": ["id"]
    }
  }
}
```

**Get schema for a specific action:**

```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "schema",
    "service": "tasks",
    "action": "create",
    "payload": {}
  }'
```

**Response:**
```json
{
  "status": true,
  "message": "Schema for 'tasks.create'",
  "data": {
    "create": {
      "type": "object",
      "properties": {
        "title": { "type": "string", "minLength": 1 },
        "status": { "type": "string", "enum": ["pending", "in-progress", "done"] }
      },
      "required": ["title"]
    }
  }
}
```

## Response Format

All responses follow a consistent structure:

```typescript
{
  status: boolean;       // true for success, false for error
  message: string;      // human-readable message
  data: {               // the actual response data
    error_id?: string;  // present on errors
    [key: string]: any;
  }
}
```

**Success response:**
```json
{
  "status": true,
  "message": "Action executed successfully",
  "data": { ... }
}
```

**Error response:**
```json
{
  "status": false,
  "message": "Validation failed: Title is required",
  "data": {}
}
```

## Error Handling

Nile uses a Result pattern internally. All errors are returned in the response without throwing HTTP exceptions:

| HTTP Status | Meaning |
|-------------|---------|
| `200` | Success |
| `400` | Bad request (invalid JSON, missing fields, validation errors) |
| `404` | Service or action not found |

## Health Check

If enabled in config, you can check server health:

```
GET /status
```

```json
{
  "status": true,
  "message": "my-app is running",
  "data": {}
}
```
