<div align="center">

# Motion QR Studio

### Ephemeral file sharing via QR codes — upload anything, set an expiry, share the QR. Content self-deletes when the timer hits zero.

[![Live Demo](https://img.shields.io/badge/Live_Demo-Visit_Site-22D3EE?style=for-the-badge&logo=amazonaws&logoColor=white)](https://d39nzea71wo364.cloudfront.net/)
[![License](https://img.shields.io/badge/License-MIT-F472B6?style=for-the-badge)](LICENSE)

[![AWS Lambda](https://img.shields.io/badge/AWS_Lambda-FF9900?style=flat-square&logo=awslambda&logoColor=white)](https://aws.amazon.com/lambda/)
[![Amazon DynamoDB](https://img.shields.io/badge/DynamoDB-4053D6?style=flat-square&logo=amazondynamodb&logoColor=white)](https://aws.amazon.com/dynamodb/)
[![Amazon S3](https://img.shields.io/badge/Amazon_S3-569A31?style=flat-square&logo=amazons3&logoColor=white)](https://aws.amazon.com/s3/)
[![API Gateway](https://img.shields.io/badge/API_Gateway-FF4F8B?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com/api-gateway/)
[![CloudFront](https://img.shields.io/badge/CloudFront-8C4FFF?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com/cloudfront/)
[![Node.js](https://img.shields.io/badge/Node.js_20-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![AWS SAM](https://img.shields.io/badge/AWS_SAM-IaC-232F3E?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com/serverless/sam/)

</div>

---

## What it does

You generate a QR code for text, a file, an image, or smart payloads (URLs, Wi-Fi credentials, vCards, geolocation). You set how long it lives — anywhere from 1 minute to 7 days. You share the QR. When someone scans it within the window, they see the content. After the window, the content is gone — enforced at three layers, with no recovery.

It's the kind of thing you'd use to share a doc with someone in a meeting room, drop a Wi-Fi password to a guest, or beam a photo across the table without iCloud, AirDrop, or a chat app.

## Why this exists

Started as a 2 KB-limited client-side QR generator. Shipped as a serverless cloud platform supporting 25 MB files with real expiry semantics. The interesting engineering work was figuring out how to enforce "the content is actually gone" with strong guarantees, while keeping the system free to run at personal scale.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          User's Browser                          │
│  [Generator Page]                              [Viewer Page]     │
└───┬──────────────────────────────────────────────┬───────────────┘
    │                                              │
    │                  ┌─────────────────────┐     │
    │                  │     CloudFront      │     │
    │                  │   (HTTPS + CDN)     │     │
    │                  └──────────┬──────────┘     │
    │                  ┌──────────▼──────────┐     │
    │                  │   S3 (frontend)     │     │
    │                  └─────────────────────┘     │
    │                                              │
    │  POST /uploads             GET /uploads/{id} │
    └───────────┐                  ┌───────────────┘
                ▼                  ▼
         ┌────────────────────────────────┐
         │     API Gateway (HTTP API)     │
         │   CORS-locked + throttled      │
         └──────┬──────────────────┬──────┘
                │                  │
       ┌────────▼─────┐    ┌───────▼──────┐
       │   Lambda     │    │   Lambda     │
       │ createUpload │    │  getUpload   │
       └────┬─────┬───┘    └───┬──────┬───┘
            │     │            │      │
   ┌────────▼─┐  ┌▼────────────▼┐  ┌──▼─────────┐
   │ S3       │  │  DynamoDB    │  │ S3         │
   │ uploads  │  │ (TTL=expAt)  │  │ uploads    │
   │ presign  │  │              │  │ presign    │
   │ PUT      │  │              │  │ GET        │
   └──────────┘  └──────────────┘  └────────────┘
```

**Two design choices worth calling out:**

1. **The browser uploads files directly to S3 via presigned URLs.** Lambda only generates permission tokens — it never sees file bytes. This bypasses Lambda's 6 MB request limit and keeps compute costs at near-zero regardless of file size.

2. **Three-layer expiry enforcement.** A frontend countdown for UX, a Lambda runtime check for security (the *real* boundary), and DynamoDB TTL + S3 lifecycle for cleanup. Each layer has a different reliability profile and a different role.



## Features

| Feature | Detail |
|---|---|
| 🔗 **QR Generation** | Text, files (≤25 MB), images, URLs, Wi-Fi, vCards, email, SMS, geo |
| ⏱️ **Configurable Expiry** | 1 min, 1 hr, 1 day, 7 days, or custom |
| 📷 **Built-in Scanner** | Camera-based + image upload fallback for non-HTTPS contexts |
| 🎨 **Custom Styling** | 6 dot shapes, gradient palettes, embedded logos, error correction levels |
| 🌗 **Dark/Light Themes** | NYC Night (refined neon) + California Beach (coastal editorial) |
| 🔒 **Secure by Default** | Presigned URLs, scoped IAM roles, CORS-locked, HTTPS-only |
| 📱 **Mobile-Optimized** | Adaptive layouts, mobile camera scanner, fallback for older browsers |
| 💰 **Free-Tier Friendly** | ~$0/month for personal use under AWS Free Tier |

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Vanilla JS, HTML, CSS | No build step, three files, fully self-contained |
| **QR Engine** | [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) | Gradient + logo support, SVG/PNG output |
| **Scanner** | [html5-qrcode](https://github.com/mebjas/html5-qrcode) | Camera + image-upload decoding |
| **Compute** | AWS Lambda (Node.js 20, ARM64) | Pay-per-invocation, ~20% cheaper on Graviton |
| **API** | API Gateway HTTP API | 70% cheaper than REST API, native CORS |
| **Database** | DynamoDB (on-demand) | Native TTL feature, no capacity planning |
| **Storage** | S3 (private uploads bucket) | Presigned URLs, lifecycle rules, SSE-S3 encryption |
| **CDN/HTTPS** | CloudFront | HTTPS termination (required for camera APIs) |
| **IaC** | AWS SAM | Single-file declarative infra, ~3-min deploys |

## Project Structure

```
motion-qr-studio/
├── README.md                  ← you are here
├── GETTING_STARTED.md         ← step-by-step deploy from zero
├── PROJECT_JOURNAL.md         ← architecture deep-dive + debug journal
├── .gitignore
├── backend/
│   ├── template.yaml          ← AWS SAM template (~160 lines of IaC)
│   └── src/
│       ├── createUpload.mjs   ← POST /uploads handler
│       ├── getUpload.mjs      ← GET /uploads/{id} handler
│       └── package.json
└── frontend/
    ├── index.html             ← generator + scanner UI
    ├── viewer.html            ← receiver page (loads from QR)
    └── config.js              ← API base URL, presets
```

## Quick Deploy

**Prerequisites:** AWS account, AWS CLI configured, AWS SAM CLI, Node.js 20+

```bash
# Backend — provisions the entire AWS stack
cd backend
npm install --prefix src
sam build
sam deploy --guided
# Note the ApiUrl from the outputs

# Frontend — point at the API and ship to S3
cd ../frontend
# Edit config.js with the ApiUrl from above
aws s3 mb s3://your-bucket-name
aws s3 sync . s3://your-bucket-name/ --cache-control "public, max-age=300"

# Then create a CloudFront distribution pointing at the S3 website endpoint
# (HTTPS is required for the camera scanner to work)
```


## Engineering Highlights

**Direct-to-S3 uploads via presigned URLs.** Lambda generates a SigV4-signed PUT URL with a 5-minute TTL bound to a specific bucket, key, content-type, and size. The browser uploads directly to S3. Compute costs stay flat regardless of file size.

**Three-layer expiry enforcement.** `expiresAt` is checked by Lambda on every read (the security boundary). DynamoDB TTL sweeps expired rows asynchronously (cleanup, not enforcement — TTL can lag up to 48 hours). S3 lifecycle hard-deletes files older than 8 days as the terminal backstop.

**Least-privilege IAM.** `createUpload` can only `PutItem` + `PutObject`. `getUpload` can only `GetItem` + `GetObject`. A bug in one function can't leak data from the other's domain.

**Cost-aware service selection.** ARM64 Graviton runtime, HTTP API Gateway over REST, on-demand DynamoDB billing, S3 lifecycle for hard cleanup. The whole system runs at ~$0/month under personal use.

**Reproducible infrastructure.** ~160 lines of declarative AWS SAM template defines every resource. `sam deploy` from a clean checkout rebuilds the entire backend in ~3 minutes.

## Cost (real numbers)

For personal use, this stack lives entirely within AWS Free Tier:

| Service | Free Tier | Personal Use |
|---|---|---|
| Lambda | 1M requests + 400K GB-seconds/month forever | <100 invocations/week |
| DynamoDB | 25 GB + 25 RCU/WCU forever | <1 MB metadata |
| API Gateway HTTP | 1M requests/month for 12 months | <500 requests/week |
| S3 | 5 GB + 20K GET / 2K PUT for 12 months | <100 MB stored |
| CloudFront | 1 TB transfer + 10M requests for 12 months | <1 GB transfer |



## Roadmap

- [ ] Password-protected links (bcrypt hash in DynamoDB)
- [ ] View-count limits (one-time-view mode)
- [ ] Custom domain via Route 53 + ACM
- [ ] Cleanup Lambda on EventBridge schedule (sub-minute deletion)
- [ ] Cognito-based authentication for owner dashboard
- [ ] Analytics table (anonymous scan tracking)
- [ ] Content scanning Lambda (S3 PutObject trigger)
- [ ] WebRTC peer-to-peer mode (no cloud storage option)



## Author

**Achyuth Narayan Shanku**
MS Information Systems · University of Cincinnati · Lindner College of Business

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/narayan-shanku/)
[![GitHub](https://img.shields.io/badge/GitHub-@Narayan--shanku-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/Narayan-shanku)


## License

MIT — see [`LICENSE`](./LICENSE) for details. Free to fork, learn from, or build on.

---

<div align="center">

**Built solo. Deployed on AWS. Documented thoroughly.**

If this project taught you something or sparked an idea, ⭐ the repo.

</div>
