# Motion QR Studio

Ephemeral QR-code sharing. Drop a file, image, or text in. Get a QR. Set an expiry from 1 minute to 7 days. When the timer hits zero, S3 hard-deletes the object and DynamoDB drops the record. The QR becomes a tombstone.

Built as a static frontend + serverless AWS backend. Free-tier-friendly for personal use.

## Architecture

```
┌──────────────────┐                                    ┌──────────────────┐
│   Browser (S3    │  POST /uploads (metadata)          │  API Gateway     │
│   static site)   │ ─────────────────────────────────► │  HTTP API        │
│                  │ ◄───────── { uploadUrl } ───────── │                  │
│  index.html      │                                    └────────┬─────────┘
│  viewer.html     │                                             │
│  config.js       │  PUT file (presigned)                       ▼
└────────┬─────────┘ ──────────────────────►  ┌────────────┐  ┌──────────┐
         │                                    │ S3 uploads │  │  Lambda  │
         │            QR scanned              │ (lifecycle │  │  (Node)  │
         │            → viewer.html?id=...    │   8d max)  │  └────┬─────┘
         │                                    └────────────┘       │
         │  GET /uploads/{id}                                       ▼
         └─────────────────────────────────►  ┌──────────────────────────┐
                                              │  DynamoDB (TTL=expiresAt)│
                                              └──────────────────────────┘
```

Two AWS-native expiry mechanisms run in parallel:
- **DynamoDB TTL** wipes the metadata row at `expiresAt`. The viewer Lambda also re-checks and returns 410 if the row is past its time (since DDB's TTL sweep can lag up to 48h).
- **S3 lifecycle** hard-deletes the object after 8 days regardless. This is the safety net — even if a record were orphaned, the bytes are gone.

## What's in the box

```
motion-qr-studio/
├── backend/
│   ├── template.yaml            # AWS SAM (CloudFormation) — full infra
│   └── src/
│       ├── createUpload.mjs     # POST /uploads
│       ├── getUpload.mjs        # GET /uploads/{id}
│       └── package.json         # AWS SDK v3 deps
├── frontend/
│   ├── index.html               # Generator (text/file/image/smart/scan)
│   ├── viewer.html              # Where scanned QRs land
│   └── config.js                # Edit after deploy: paste your API URL
└── README.md
```

## Features

- Five tabs: **Text**, **File**, **Image**, **Smart** (URL / Wi-Fi / vCard / Email / SMS / Geo), **Scan** (camera-based decoder)
- Real expiry: 1 min to 7 days, presets + custom
- Direct browser-to-S3 upload (presigned PUT) — Lambda never touches the bytes
- Six dot styles, six color palettes (incl. gradient), embedded logo, four EC levels
- PNG / SVG download, copy-to-clipboard, share-link
- Live countdown on both generator and viewer
- "Scan Safe" mode disables motion (helps stubborn camera scanners)
- Built on `qr-code-styling` (engine) + `html5-qrcode` (scanner) — both via CDN, no build step

---

## Prerequisites

- An AWS account
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) configured with credentials (`aws configure`)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Node.js 20+ (for the Lambda layer)

## Deploy

### 1. Backend

```bash
cd backend
npm install --prefix src
sam build
sam deploy --guided
```

`--guided` is a one-time interactive wizard. Use these answers:

| Prompt | Value |
|---|---|
| Stack Name | `motion-qr-studio` |
| AWS Region | pick one near your users (e.g. `us-east-1`) |
| Parameter `AppName` | `motion-qr-studio` |
| Parameter `CorsOrigin` | `*` for now (lock down later — see Hardening) |
| Parameter `MaxFileSizeMB` | `25` |
| Parameter `HardDeleteDays` | `8` |
| Confirm changes | `Y` |
| Allow IAM role creation | `Y` |
| Save arguments | `Y` (writes `samconfig.toml`) |

When it finishes, copy the `ApiUrl` from the **Outputs** section. Looks like:

```
https://abc123xyz.execute-api.us-east-1.amazonaws.com
```

### 2. Frontend config

Edit `frontend/config.js`:

```js
window.MOTION_QR_CONFIG = {
  apiBase: "https://abc123xyz.execute-api.us-east-1.amazonaws.com",  // ← paste here
  viewerBase: "",   // leave blank if frontend and viewer.html are on the same origin
  ...
};
```

### 3. Frontend hosting on S3

Pick a globally-unique bucket name (e.g. `motion-qr-yourname`).

```bash
BUCKET=motion-qr-yourname
REGION=us-east-1

aws s3api create-bucket --bucket $BUCKET --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION

aws s3 website s3://$BUCKET/ --index-document index.html

# Allow public reads (this bucket only hosts static frontend)
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

cat > /tmp/policy.json <<EOF
{ "Version":"2012-10-17","Statement":[{"Sid":"PublicRead","Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::$BUCKET/*"}]}
EOF
aws s3api put-bucket-policy --bucket $BUCKET --policy file:///tmp/policy.json

aws s3 sync ./frontend s3://$BUCKET/ --delete --cache-control "public, max-age=300"
```

Your site is live at:

```
http://$BUCKET.s3-website-$REGION.amazonaws.com
```

### 4. Test it

Open the site, type some text in the Text tab, hit Generate. Scan the QR with your phone. You should land on the viewer page. Wait for the expiry, refresh — content should be gone.

---

## Local development

The frontend is just static HTML — any file server works:

```bash
cd frontend
python3 -m http.server 8000
# visit http://localhost:8000
```

For local Lambda testing:

```bash
cd backend
sam local start-api --port 3001
```

Then in `frontend/config.js`, point `apiBase` at `http://localhost:3001`.

---

## Cost estimate (personal use)

For ≤1,000 generations/month, ≤500 MB total uploaded, this runs **$0** on AWS free tier:
- Lambda: 1M free requests/month forever
- API Gateway HTTP API: 1M free requests for 12 months
- DynamoDB: 25 GB + 25 RCU/WCU free forever
- S3: 5 GB + 20K GET / 2K PUT free for 12 months

Past the free tier, the heaviest cost is S3 storage (~$0.023/GB/month) and outbound bandwidth ($0.09/GB). Lifecycle deletes keep storage bounded.

---

## Hardening checklist (when you're ready to ship for real)

- [ ] **Lock CORS to your domain** — redeploy with `CorsOrigin=https://your-domain.com` instead of `*`. Both the API Gateway config and the S3 uploads bucket CORS rules pick this up.
- [ ] **Custom domain + CloudFront** — front the S3 site with CloudFront, attach an ACM cert, point your domain at it. Same for the API.
- [ ] **Authentication** — currently anonymous. For private use, put Cognito or a JWT authorizer in front of `POST /uploads`. Keep `GET /uploads/{id}` public (the UUID is the capability).
- [ ] **Rate limiting** — already throttled to 20 req/s burst 50. Add WAF if you need IP-based rules or geo-blocking.
- [ ] **Content scanning** — for fully public deployment, add a Lambda triggered on S3 PutObject that runs a virus/abuse scan and revokes the metadata row if it fails.
- [ ] **Encryption at rest with KMS** — currently SSE-S3 (AWS-managed). Switch to SSE-KMS with a customer-managed key for compliance contexts.
- [ ] **Audit logging** — enable CloudTrail data events on the uploads bucket; pipe API Gateway access logs to CloudWatch.
- [ ] **Per-link password / view limit** — extend the metadata schema to include `password` (bcrypt) and `maxViews`, decrement on each `getUpload`.

---

## How expiry actually works (in detail)

Three layers, weakest to strongest:

1. **Frontend countdown** (cosmetic). The browser reads `expiresAt` and ticks down. Trivially bypassed — don't trust this for security.
2. **Lambda enforcement** (real). `getUpload` checks `expiresAt < now` on every read and returns 410 Gone. This is the boundary — past expiry, the API stops serving the content.
3. **Auto-delete** (terminal). DynamoDB TTL sweeps the metadata row (within ~48h of `expiresAt`). S3 lifecycle hard-deletes the object after `HardDeleteDays`. Once both have run, the data is unrecoverable from the system.

The window between "Lambda starts returning 410" and "data is physically gone" is up to 8 days, but during that window no API call can retrieve the content. If you need stricter physical deletion, add an EventBridge schedule that runs a cleanup Lambda hourly.

---

## License

MIT — do whatever, no warranty.
