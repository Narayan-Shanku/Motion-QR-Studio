// getUpload.mjs
// GET /uploads/{id}
// Returns: { kind, expiresAt, ...kind-specific fields }
//   - kind=text:        { text }
//   - kind=file/image:  { contentType, fileName, sizeBytes, downloadUrl }

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const TABLE = process.env.METADATA_TABLE;
const BUCKET = process.env.UPLOADS_BUCKET;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const cors = {
  "access-control-allow-origin": CORS_ORIGIN,
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json",
};

const reply = (status, body) => ({
  statusCode: status,
  headers: cors,
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  const id = event?.pathParameters?.id;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    return reply(400, { error: "Invalid id" });
  }

  const res = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { id },
  }));
  const item = res.Item;
  if (!item) {
    return reply(404, { error: "Not found or expired" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (item.expiresAt && item.expiresAt < now) {
    // DynamoDB TTL can lag up to 48 hours, so we double-check at read time
    return reply(410, { error: "Expired", expiresAt: item.expiresAt });
  }

  const base = {
    id: item.id,
    kind: item.kind,
    expiresAt: item.expiresAt,
    createdAt: item.createdAt,
  };

  if (item.kind === "text") {
    return reply(200, { ...base, text: item.text });
  }

  // File / image: presign a GET URL
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: item.s3Key,
    ResponseContentType: item.contentType,
    ResponseContentDisposition: item.fileName
      ? `inline; filename="${item.fileName.replace(/"/g, "")}"`
      : undefined,
  });
  // Match the remaining lifetime of the upload, capped at 1 hour
  const remaining = Math.max(60, item.expiresAt - now);
  const expiresIn = Math.min(remaining, 3600);
  const downloadUrl = await getSignedUrl(s3, cmd, { expiresIn });

  return reply(200, {
    ...base,
    contentType: item.contentType,
    fileName: item.fileName,
    sizeBytes: item.sizeBytes,
    downloadUrl,
  });
};
