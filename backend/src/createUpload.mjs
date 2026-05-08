// createUpload.mjs
// POST /uploads
// Body: { kind: "text"|"file"|"image", contentType, fileName?, sizeBytes, ttlSeconds, text? }
// Returns: { id, uploadUrl?, viewPath, expiresAt }
//
// For "text" kind: stored directly in DynamoDB, no S3 upload.
// For "file"/"image": returns a presigned S3 PUT URL the browser uses to upload.

import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const TABLE = process.env.METADATA_TABLE;
const BUCKET = process.env.UPLOADS_BUCKET;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MAX_SIZE = parseInt(process.env.MAX_SIZE_BYTES || "25000000", 10);
const MIN_TTL = 60;                    // 1 minute
const MAX_TTL = 7 * 24 * 60 * 60;      // 7 days
const MAX_TEXT_BYTES = 64 * 1024;      // 64 KB cap on inline text

const cors = {
  "access-control-allow-origin": CORS_ORIGIN,
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json",
};

const reply = (status, body) => ({
  statusCode: status,
  headers: cors,
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, { error: "Invalid JSON body" });
  }

  const { kind, contentType, fileName, sizeBytes, ttlSeconds, text } = body;

  // ── Validation ──────────────────────────────────────
  if (!["text", "file", "image"].includes(kind)) {
    return reply(400, { error: "kind must be one of: text, file, image" });
  }
  const ttl = parseInt(ttlSeconds, 10);
  if (!Number.isFinite(ttl) || ttl < MIN_TTL || ttl > MAX_TTL) {
    return reply(400, { error: `ttlSeconds must be between ${MIN_TTL} and ${MAX_TTL}` });
  }

  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttl;
  const viewPath = `/viewer.html?id=${id}`;

  // ── Text kind: store in DynamoDB directly ──────────
  if (kind === "text") {
    if (typeof text !== "string" || text.length === 0) {
      return reply(400, { error: "text required for kind=text" });
    }
    if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
      return reply(413, { error: `text exceeds ${MAX_TEXT_BYTES} bytes` });
    }
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { id, kind, text, createdAt: now, expiresAt, ttl: expiresAt },
    }));
    return reply(200, { id, kind, viewPath, expiresAt });
  }

  // ── File / image kind: presigned S3 PUT ────────────
  if (typeof contentType !== "string" || !contentType) {
    return reply(400, { error: "contentType required for file/image" });
  }
  const size = parseInt(sizeBytes, 10);
  if (!Number.isFinite(size) || size <= 0) {
    return reply(400, { error: "sizeBytes must be a positive integer" });
  }
  if (size > MAX_SIZE) {
    return reply(413, { error: `sizeBytes exceeds max of ${MAX_SIZE}` });
  }
  if (kind === "image" && !contentType.startsWith("image/")) {
    return reply(400, { error: "contentType must start with image/ for kind=image" });
  }

  const key = `uploads/${id}`;

  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });
  // Presigned URL valid for 5 minutes — long enough to upload, short enough to not linger
  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 300 });

  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      id,
      kind,
      s3Key: key,
      contentType,
      fileName: typeof fileName === "string" ? fileName.slice(0, 255) : null,
      sizeBytes: size,
      createdAt: now,
      expiresAt,
      ttl: expiresAt,
    },
  }));

  return reply(200, { id, kind, uploadUrl, viewPath, expiresAt });
};
