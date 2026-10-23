---
title: "File uploads"
description: "Accept multipart files in an action with count, size, filename and type limits, and read them as a structured payload"
---

An upload is an action whose input arrives as multipart form data. Nile Js parses the form, applies the limits in `rest.uploads`, and passes the fields and files to your handler as a structured payload. Nile Js does not store the files; your handler decides where they go.

## When to use it

Use an upload action when a client sends a document or image with other fields in one request. Set `isSpecial: { contentType: "multipart/form-data" }` on the action so Nile Js routes the request to the form parser and rejects JSON bodies for it.

## Complete example

The server sets the limits. The action reads one `document` file and one `title` field. The handler returns the file's name, type and size; a real action would save the file to storage.

```ts
import {
  createAction,
  createNileServer,
  createServices,
  type StructuredPayload,
} from "@nilejs/nile";
import { Err, Ok } from "slang-ts";

const inspectDocumentHandler = (payload: StructuredPayload) => {
  const document = payload.files.document;
  const title = payload.fields.title;

  if (!(document instanceof File)) {
    return Err("Send one document");
  }

  if (typeof title !== "string") {
    return Err("A title is required");
  }

  return Ok({
    title: title,
    filename: document.name,
    size: document.size,
  });
};

const inspectDocumentAction = createAction<StructuredPayload>({
  name: "inspect",
  description: "Inspect an uploaded PDF or image",
  isSpecial: { contentType: "multipart/form-data" },
  handler: inspectDocumentHandler,
});

const services = createServices([
  {
    name: "documents",
    description: "Document intake",
    actions: [inspectDocumentAction],
  },
]);

export const server = await createNileServer({
  serverName: "documents",
  services: services,
  rest: {
    baseUrl: "/api",
    allowedOrigins: ["https://app.example.com"],
    uploads: {
      enforceContentType: true,
      limits: {
        maxFiles: 3,
        maxFileSize: 5 * 1024 * 1024,
        maxTotalSize: 10 * 1024 * 1024,
        minFileSize: 1,
        maxFilenameLength: 128,
      },
      allow: {
        mimeTypes: ["image/png", "image/jpeg", "application/pdf"],
        extensions: [".png", ".jpg", ".jpeg", ".pdf"],
      },
    },
  },
});

export const uploadDocument = async (): Promise<void> => {
  const formData = new FormData();
  formData.append("intent", "execute");
  formData.append("service", "documents");
  formData.append("action", "inspect");
  formData.append("title", "Project brief");
  formData.append("document", selectedFile);

  const response = await fetch("https://app.example.com/api/services", {
    method: "POST",
    body: formData,
  });
  console.log(response.status);
};
```

The client sends the same request with the `upload` method of `@nilejs/client`:

```ts
import { createNileClient } from "@nilejs/client";

interface DocumentPayloads {
  documents: {
    inspect: { title: string };
  };
}

const nile = createNileClient<DocumentPayloads>({
  baseUrl: "https://app.example.com/api",
});

export const uploadBrief = async (): Promise<void> => {
  const result = await nile.upload({
    service: "documents",
    action: "inspect",
    files: { document: selectedFile },
    fields: { title: "Project brief" },
  });

  if (result.isErr) {
    console.error(result.error, result.details);
    return;
  }

  console.log(result.value);
};
```

The request can also be sent with curl. The routing fields `intent`, `service` and `action` go in the form with the other fields:

```sh
curl -s -X POST http://localhost:8000/api/services \
  -F 'intent=execute' -F 'service=documents' -F 'action=inspect' \
  -F 'title=Project brief' -F 'document=@./brief.pdf;type=application/pdf'
```

With a 9-byte PDF named `tiny.pdf`, the example project returned:

```json
{
  "status": true,
  "message": "Action 'documents.inspect' executed",
  "data": {
    "title": "Project brief",
    "filename": "tiny.pdf",
    "contentType": "application/pdf",
    "size": 9
  }
}
```

The complete runnable project, including oversized and wrong-type checks, is in [the file upload example](/guide/examples/file-upload).

## Options that matter

| Option | Effect |
| --- | --- |
| `rest.uploads.limits.maxFiles` | Most files in one request. |
| `rest.uploads.limits.maxFileSize`, `minFileSize` | Largest and smallest size for one file. A zero-byte file is rejected by default. |
| `rest.uploads.limits.maxTotalSize` | Combined size of all files. |
| `rest.uploads.limits.maxFilenameLength` | Longest file name accepted. |
| `rest.uploads.allow.mimeTypes`, `allow.extensions` | Types and extensions a file must match. |
| `rest.uploads.enforceContentType` | Checks the request type against the action's `isSpecial.contentType`. |
| `rest.protection.maxBodyBytes` | Largest request body read before parsing. Default 10 MiB. |

## How it behaves

- The handler receives `{ fields, files }`. A repeated key becomes an array.
- Using the same key for a file and a text field is rejected, whatever `uploadMode` is set to.
- Each file is checked in this order: name length, zero bytes, minimum size, file count, maximum size, total size, then the type and extension allowlist.
- A JSON request to a multipart action returns HTTP 400. The response names what the action expects:

```json
{
  "status": false,
  "message": "Action 'documents.inspect' expects multipart/form-data. Send the request as form data with its files.",
  "data": {
    "error_category": "validation",
    "expected": "multipart/form-data",
    "received": "application/json"
  }
}
```

- A multipart request to an action that declares a different `isSpecial.contentType`, such as `application/json`, returns HTTP 415 with `data.expected` and `data.received`.
- A file over the limit returns a failure with `error_category: "validation"`, the limit name, the maximum and the offending files. In the example project, a 6 MiB file returned `upload limit exceeded` with `"limit":"maxFileSize","max":5242880`.
- A multipart request to an ordinary action that does not declare `isSpecial` runs as that action. Use this only for actions that do not need files.

## Limits

- Validation trusts the declared type and the file extension. It does not inspect the file's bytes. In the example, a text file named `fake.png` with type `image/png` was accepted. Check the content in your handler when it matters.
- The whole body is read before parsing. A request larger than `maxBodyBytes` is refused even when each file is within its own limit. Raise `maxBodyBytes` when `maxTotalSize` is larger than the default 10 MiB, plus room for the form fields.
- Nile Js does not scan for malware, store files or enforce who may download them. Those belong to your application.
- Buffered parsing holds the upload in memory while it is handled.

## Common mistakes

- Trusting `file.type` for security. Check the bytes, or store the file and process it in an isolated worker.
- Setting `maxTotalSize` above `maxBodyBytes` and wondering why large uploads fail.
- Sending JSON to an upload action, or a multipart body to a JSON action.
- Forgetting authentication. Mark the upload action `isProtected` and configure `auth` when files are private.

## See also

- [Uploads](/guide/basics/uploads) has the full configuration reference.
- [File serving](/guide/basics/file-serving) covers returning files to clients.
- [Production operations](/guide/reference/operations) describes request body limits and client addresses.
