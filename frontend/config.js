// Edit this file after `sam deploy` to point at your API.
// The deploy outputs an "ApiUrl" — paste it here.
window.MOTION_QR_CONFIG = {
  // Example: "https://abc123.execute-api.us-east-1.amazonaws.com"
  apiBase: " https://g7y6jzlh32.execute-api.us-east-1.amazonaws.com",

  // Where viewer.html is hosted. Usually same origin.
  // If you deploy frontend to https://qr.example.com, leave this blank.
  // For local dev, set to e.g. "http://localhost:8000"
  viewerBase: "",

  // Default TTL options shown in the UI (seconds)
  ttlPresets: [
    { label: "5 min", seconds: 300 },
    { label: "1 hour", seconds: 3600 },
    { label: "1 day", seconds: 86400 },
    { label: "7 days", seconds: 604800 },
  ],

  // Hard cap matching the backend
  maxFileSizeMB: 25,
};
