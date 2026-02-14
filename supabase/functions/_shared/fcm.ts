const encoder = new TextEncoder();

const base64UrlEncode = (input: Uint8Array) =>
  btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const pemToBytes = (pem: string) => {
  const cleaned = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

const getAccessToken = async (serviceAccount: ServiceAccount) => {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return cachedToken.token;
  }

  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const headerBytes = encoder.encode(JSON.stringify(header));
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const headerPart = base64UrlEncode(headerBytes);
  const payloadPart = base64UrlEncode(payloadBytes);
  const signingInput = `${headerPart}.${payloadPart}`;

  const keyData = pemToBytes(serviceAccount.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signingInput)
  );
  const signaturePart = base64UrlEncode(new Uint8Array(signature));
  const assertion = `${signingInput}.${signaturePart}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FCM auth failed: ${text}`);
  }

  const data = await response.json();
  const token = String(data.access_token ?? "");
  const expiresIn = Number(data.expires_in ?? 3600);
  cachedToken = { token, expiresAt: now + expiresIn };
  return token;
};

export const sendFcmMessage = async ({
  serviceAccount,
  projectId,
  token,
  title,
  body,
  data
}: {
  serviceAccount: ServiceAccount;
  projectId: string;
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) => {
  const accessToken = await getAccessToken(serviceAccount);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data
        }
      })
    }
  );

  const responseText = await response.text();
  let responseJson: Record<string, unknown>;
  try {
    responseJson = responseText ? JSON.parse(responseText) : {};
  } catch {
    responseJson = { raw: responseText };
  }

  return {
    ok: response.ok,
    status: response.status,
    body: responseJson
  };
};
