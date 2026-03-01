# File Uploads

Nile handles multipart form-data uploads through the same single POST endpoint. Files are parsed, validated through a 7-step chain, and delivered to your action handler as a structured payload.

## Configuration

Enable uploads in your REST config:

```typescript
const server = createNileServer({
  name: "MyApp",
  services: [/* ... */],
  rest: {
    baseUrl: "/api/v1",
    allowedOrigins: ["http://localhost:3000"],
    uploads: {
      enforceContentType: true,
      limits: {
        maxFiles: 5,
        maxFileSize: 5 * 1024 * 1024,     // 5MB per file
        minFileSize: 1,                     // reject zero-byte files
        maxTotalSize: 20 * 1024 * 1024,    // 20MB total
        maxFilenameLength: 128,
      },
      allow: {
        mimeTypes: ["image/png", "image/jpeg", "application/pdf"],
        extensions: [".png", ".jpg", ".jpeg", ".pdf"],
      },
    },
  },
});
```

### Upload Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enforceContentType` | `boolean` | `false` | Enforce action-level content-type matching |
| `limits.maxFiles` | `number` | `10` | Maximum number of files per request |
| `limits.maxFileSize` | `number` | `10MB` | Maximum size per individual file (bytes) |
| `limits.minFileSize` | `number` | `1` | Minimum file size (rejects zero-byte files) |
| `limits.maxTotalSize` | `number` | `20MB` | Maximum combined size of all files |
| `limits.maxFilenameLength` | `number` | `128` | Maximum filename character length |
| `allow.mimeTypes` | `string[]` | `["image/png", "image/jpeg", "application/pdf"]` | Allowed MIME types |
| `allow.extensions` | `string[]` | `[".png", ".jpg", ".jpeg", ".pdf"]` | Allowed file extensions |

## Sending Uploads

Form-data requests must include the RPC routing fields (`intent`, `service`, `action`) as string fields alongside file fields.

### Using the Nile Client

```typescript
import { createNileClient } from "@nilejs/client";

const nile = createNileClient({ baseUrl: "http://localhost:8000/api/v1" });

const { error, data } = await nile.upload({
  service: "documents",
  action: "upload",
  files: {
    document: new File(["content"], "report.pdf", { type: "application/pdf" }),
  },
  fields: {
    title: "Q4 Report",
    category: "finance",
  },
});
```

### Using fetch Directly

```typescript
const formData = new FormData();
formData.append("intent", "execute");
formData.append("service", "documents");
formData.append("action", "upload");
formData.append("title", "Q4 Report");
formData.append("document", file);

const response = await fetch("http://localhost:8000/api/v1/services", {
  method: "POST",
  body: formData,
});
```

### Using curl

```bash
curl -X POST http://localhost:8000/api/v1/services \
  -F "intent=execute" \
  -F "service=documents" \
  -F "action=upload" \
  -F "title=Q4 Report" \
  -F "document=@./report.pdf"
```

## Action Handler

Your action handler receives a `StructuredPayload` with `fields` and `files` separated:

```typescript
import { Ok, Err } from "slang-ts";
import { createAction, type Action } from "@nilejs/nile";

const uploadDocument: Action = createAction({
  name: "upload",
  description: "Upload a document",
  isSpecial: {
    contentType: "multipart/form-data",
    uploadMode: "flat",
  },
  handler: (data, context) => {
    const { fields, files } = data as {
      fields: Record<string, string | string[]>;
      files: Record<string, File | File[]>;
    };

    const title = fields.title as string;
    const document = files.document as File;

    // Process the file (save to storage, etc.)
    return Ok({
      title,
      filename: document.name,
      size: document.size,
      type: document.type,
    });
  },
});
```

### Action-Level Config

The `isSpecial` field on an action controls upload behavior:

| Option | Type | Description |
|--------|------|-------------|
| `contentType` | `"multipart/form-data" \| "application/json" \| "other"` | Expected content type for this action |
| `uploadMode` | `"flat" \| "structured"` | Parsing mode (default: `"flat"`) |

## Parsing Modes

### Flat Mode (default)

Rejects requests where the same form-data key carries both files and string fields. This prevents ambiguous payloads.

```
✓ document=@file.pdf, title="Report"       (different keys)
✗ data=@file.pdf, data="some string"        (same key, mixed types)
```

### Structured Mode

Allows any combination of keys. Files and fields are separated into their respective buckets, with duplicate keys aggregated into arrays.

```
✓ attachment=@file1.pdf, attachment=@file2.pdf   (array of files)
✓ tag=frontend, tag=docs                         (array of strings)
```

## Validation Chain

Every upload request passes through a 7-step validation chain that fails fast on the first error:

1. **Filename length** — rejects files with names exceeding the configured limit
2. **Zero-byte detection** — rejects empty files
3. **Minimum size** — rejects files smaller than the threshold
4. **File count** — rejects requests exceeding the max file count
5. **Per-file size** — rejects individual files exceeding the size limit
6. **Total size** — rejects requests where combined file size exceeds the limit
7. **MIME + extension allowlist** — rejects files that don't match both the allowed MIME type and extension

## Error Responses

Validation errors return structured error data with the `error_category` field:

```json
{
  "status": false,
  "message": "upload limit exceeded",
  "data": {
    "error_category": "validation",
    "limit": "maxFileSize",
    "max": 5242880,
    "files": [{ "name": "huge-video.mp4", "size": 104857600 }]
  }
}
```

```json
{
  "status": false,
  "message": "file type not allowed",
  "data": {
    "error_category": "validation",
    "rejected": [{ "name": "script.exe", "type": "application/x-msdownload" }],
    "allowed": {
      "mimeTypes": ["image/png", "image/jpeg", "application/pdf"],
      "extensions": [".png", ".jpg", ".jpeg", ".pdf"]
    }
  }
}
```

```json
{
  "status": false,
  "message": "mixed key types not allowed",
  "data": {
    "error_category": "validation",
    "conflicts": ["data"],
    "hint": "Same key cannot be used for both files and fields"
  }
}
```

## Content-Type Enforcement

When `enforceContentType` is enabled and an action specifies `isSpecial.contentType`, Nile checks that the incoming request's content type matches. Mismatches return `415 Unsupported Media Type`.

This is useful when certain actions should only accept file uploads and reject JSON requests.
