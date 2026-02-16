# File Handling

## Table of Contents

- Storage layout
- Upload processing
- File type restrictions
- Size limits
- Filename generation
- Storing attachment records
- Serving files
- Cleanup on task deletion

---

## Storage Layout

All user-uploaded files live under `.beacon/storage/` in the host app's
project root. Subdirectories organize by type:

```
.beacon/
└── storage/
    ├── screenshots/
    │   ├── a1b2c3d4-screenshot.png
    │   └── e5f6g7h8-viewport-capture.jpg
    └── attachments/
        ├── i9j0k1l2-error-log.txt
        └── m3n4o5p6-config.json
```

Files are stored with a UUID prefix to prevent name collisions. The original
filename is preserved in the database record for display purposes.

---

## Upload Processing

The feedback submission endpoint accepts files via multipart FormData. The
processing flow:

```typescript
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import crypto from 'crypto';

const STORAGE_BASE = join(process.cwd(), '.beacon', 'storage');

interface ProcessedFile {
  id: string;           // UUID for the attachment record
  type: string;         // 'screenshot' | 'attachment'
  filename: string;     // Original filename
  path: string;         // Relative path within storage (e.g., 'screenshots/abc-screenshot.png')
  mimeType: string;     // Detected MIME type
  sizeBytes: number;    // File size
}

async function processUploadedFile(
  file: File,
  fileType: 'screenshot' | 'attachment'
): Promise<ProcessedFile> {
  const id = crypto.randomUUID();
  const ext = getExtension(file.name);
  const safeFilename = `${id.slice(0, 8)}-${sanitizeFilename(file.name)}`;
  const subdir = fileType === 'screenshot' ? 'screenshots' : 'attachments';
  const relativePath = `${subdir}/${safeFilename}`;
  const absolutePath = join(STORAGE_BASE, relativePath);

  // Ensure directory exists
  await mkdir(join(STORAGE_BASE, subdir), { recursive: true });

  // Write file
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  return {
    id,
    type: fileType,
    filename: file.name,
    path: relativePath,
    mimeType: file.type || guessMimeType(ext),
    sizeBytes: buffer.byteLength,
  };
}
```

### Using It in the Feedback Handler

```typescript
route('POST', '/feedback', async (event, db, config, params) => {
  const formData = await parseFormData(event);
  if (!formData) return errorResponse(400, 'Invalid form data');

  // ... validate text fields ...

  // Process screenshot
  const processedFiles: ProcessedFile[] = [];
  const screenshotFile = formData.get('screenshot') as File | null;
  if (screenshotFile && screenshotFile.size > 0) {
    validateFileType(screenshotFile, ALLOWED_IMAGE_TYPES);
    validateFileSize(screenshotFile, MAX_SCREENSHOT_SIZE);
    processedFiles.push(await processUploadedFile(screenshotFile, 'screenshot'));
  }

  // Process additional attachments
  const attachmentFiles = formData.getAll('attachments[]') as File[];
  for (const file of attachmentFiles) {
    if (file.size === 0) continue;
    validateFileType(file, ALLOWED_ATTACHMENT_TYPES);
    validateFileSize(file, MAX_ATTACHMENT_SIZE);
    processedFiles.push(await processUploadedFile(file, 'attachment'));
  }

  // Create task
  const task = db.createTask({ description, type, priority, /* ... */ });

  // Create attachment records
  for (const pf of processedFiles) {
    db.createAttachment({
      id: pf.id,
      task_id: task.id,
      type: pf.type,
      filename: pf.filename,
      path: pf.path,
      mime_type: pf.mimeType,
      size_bytes: pf.sizeBytes,
    });
  }

  return jsonResponse({ id: task.id, public_id: task.public_id }, 201);
});
```

---

## File Type Restrictions

Only allow specific file types. Reject anything else with a 400 error.

```typescript
const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

const ALLOWED_ATTACHMENT_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'text/plain',
  'application/json',
  'text/csv',
  'text/html',
  'text/css',
  'application/javascript',
  'text/javascript',
  'application/xml',
  'text/xml',
];

function validateFileType(file: File, allowedTypes: string[]): void {
  if (!allowedTypes.includes(file.type)) {
    throw new ValidationError(
      `File type '${file.type}' is not allowed. Allowed: ${allowedTypes.join(', ')}`
    );
  }
}
```

Why restrict types: Beacon stores files on the local filesystem and serves
them through an HTTP endpoint. Allowing arbitrary file types (especially
executables, HTML with scripts, or SVG with embedded JS) creates unnecessary
risk. The allowed list covers what users actually upload as feedback evidence.

---

## Size Limits

```typescript
const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024;   // 10 MB
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;     // 5 MB
const MAX_ATTACHMENTS_PER_TASK = 10;
const MAX_TOTAL_UPLOAD_SIZE = 50 * 1024 * 1024;  // 50 MB per submission

function validateFileSize(file: File, maxSize: number): void {
  if (file.size > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(0);
    throw new ValidationError(
      `File '${file.name}' is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Maximum: ${maxMB} MB`
    );
  }
}
```

Check the total attachment count before processing individual files:

```typescript
const attachmentFiles = formData.getAll('attachments[]') as File[];
const totalFiles = (screenshotFile ? 1 : 0) + attachmentFiles.length;

if (totalFiles > MAX_ATTACHMENTS_PER_TASK) {
  return errorResponse(400, `Maximum ${MAX_ATTACHMENTS_PER_TASK} files per submission`);
}
```

---

## Filename Generation

User-provided filenames are sanitized to prevent path traversal and
filesystem issues:

```typescript
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')  // Replace unsafe chars
    .replace(/\.{2,}/g, '.')             // Collapse multiple dots
    .replace(/^\./, '_')                 // No leading dot (hidden files)
    .slice(0, 100);                      // Truncate long names
}

function getExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return '.' + parts.pop()!.toLowerCase();
}

function guessMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
  };
  return map[ext] || 'application/octet-stream';
}
```

The UUID prefix ensures uniqueness even if two users upload files with
identical names. The original filename is stored in the database for
display in the dashboard.

---

## Serving Files

Files are served through the `GET /attachments/:id` endpoint. The handler
looks up the attachment record, resolves the file path, and streams the
content with appropriate headers. See the `sveltekit-handle-hook` static
serving reference for the `serveFile` implementation with path traversal
prevention.

The key addition for attachment serving: set `Content-Disposition` to
suggest a filename for downloads:

```typescript
route('GET', '/attachments/:id', async (event, db, config, params) => {
  const attachment = db.getAttachment(params.id);
  if (!attachment) return errorResponse(404, 'Attachment not found');

  const filePath = join(STORAGE_BASE, attachment.path);

  // Path traversal check
  if (!filePath.startsWith(STORAGE_BASE)) {
    return errorResponse(403, 'Invalid attachment path');
  }

  try {
    const content = await readFile(filePath);
    return new Response(content, {
      headers: {
        'Content-Type': attachment.mime_type,
        'Content-Length': String(content.byteLength),
        'Content-Disposition': `inline; filename="${attachment.filename}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return errorResponse(404, 'Attachment file not found on disk');
  }
});
```

Use `inline` disposition for images (so the browser displays them) and
`attachment` for other file types (so the browser downloads them):

```typescript
const disposition = attachment.mime_type.startsWith('image/')
  ? `inline; filename="${attachment.filename}"`
  : `attachment; filename="${attachment.filename}"`;
```

---

## Cleanup on Task Deletion

When a task is deleted, its attachment files must be removed from disk.
The database handles CASCADE deletion of the attachment records, but the
files on disk need explicit cleanup:

```typescript
route('DELETE', '/tasks/:id', async (event, db, config, params, auth) => {
  if (!auth.isAdmin) return errorResponse(403, 'Admin access required');

  const task = db.getTask(params.id);
  if (!task) return errorResponse(404, 'Task not found');

  // Get attachments before deleting (CASCADE will remove the records)
  const attachments = db.getAttachments(params.id);

  // Delete task (CASCADE deletes attachments, notes, logs, activity)
  db.deleteTask(params.id);

  // Clean up files from disk
  for (const att of attachments) {
    const filePath = join(STORAGE_BASE, att.path);
    try {
      await unlink(filePath);
    } catch {
      // File already missing — not a critical error
      console.warn(`[Beacon] Could not delete file: ${att.path}`);
    }
  }

  // Log activity happens before deletion, so we skip it here
  return new Response(null, { status: 204 });
});
```

Delete the database record first (atomically via CASCADE), then clean up
files. If the file cleanup fails, the database is still consistent — you
just have orphaned files, which is better than orphaned database records.

---

## Export Format for Sync

When tasks are exported for production-to-local sync, attachments are
included as base64-encoded data in the JSON payload:

```typescript
async function exportAttachment(attachment: AttachmentRow): Promise<ExportedAttachment> {
  const filePath = join(STORAGE_BASE, attachment.path);
  const content = await readFile(filePath);
  return {
    filename: attachment.filename,
    type: attachment.type,
    mime_type: attachment.mime_type,
    data: content.toString('base64'),
  };
}
```

On the import side (`npx beacon pull`), the base64 data is decoded and
written to the local `.beacon/storage/` directory, and a new attachment
record is created pointing to the local file path.
