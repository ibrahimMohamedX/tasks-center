// export default {
//   async fetch(request, env) {
//     return new Response(
//       JSON.stringify({
//         ok: true,
//         service: "archai-tasks-notifications",
//         project: env.FIREBASE_PROJECT_ID,
//       }),
//       {
//         headers: {
//           "Content-Type": "application/json",
//         },
//       },
//     );
//   },
// };
const FIREBASE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function base64UrlEncode(value) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binary = atob(base64);

  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function createGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: serviceAccount.client_email,
    scope: FIREBASE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedToken),
  );

  const signedJwt = `${unsignedToken}.${base64UrlEncode(
    new Uint8Array(signature),
  )}`;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },

    body:
      "grant_type=" +
      encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") +
      "&assertion=" +
      encodeURIComponent(signedJwt),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Google OAuth error: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function getFirebaseServiceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT secret is missing.");
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }

  return serviceAccount;
}

async function getFirestoreDocuments(accessToken, projectId, collectionName) {
  const url =
    `https://firestore.googleapis.com/v1/` +
    `projects/${projectId}/databases/(default)/documents/` +
    `${collectionName}?pageSize=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Firestore error: ${JSON.stringify(data)}`);
  }

  return data.documents || [];
}

function getFirestoreFieldValue(fields, fieldName) {
  const field = fields?.[fieldName];

  if (!field) {
    return null;
  }

  if ("stringValue" in field) {
    return field.stringValue;
  }

  if ("booleanValue" in field) {
    return field.booleanValue;
  }

  if ("integerValue" in field) {
    return Number(field.integerValue);
  }

  if ("doubleValue" in field) {
    return Number(field.doubleValue);
  }

  return null;
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/") {
        return Response.json({
          ok: true,
          service: "archai-tasks-notifications",
          project: env.FIREBASE_PROJECT_ID,
        });
      }

      if (url.pathname === "/send-test-notification") {
        const serviceAccount = await getFirebaseServiceAccount(env);

        const accessToken = await createGoogleAccessToken(serviceAccount);

        const documents = await getFirestoreDocuments(
          accessToken,
          env.FIREBASE_PROJECT_ID,
          "fcmTokens",
        );

        const activeTokens = documents
          .map((document) => {
            const fields = document.fields || {};

            return {
              token: getFirestoreFieldValue(fields, "token"),

              uid: getFirestoreFieldValue(fields, "uid"),

              userName: getFirestoreFieldValue(fields, "userName"),

              active: getFirestoreFieldValue(fields, "active"),
            };
          })
          .filter((item) => item.active === true && item.token);

        if (activeTokens.length === 0) {
          return Response.json(
            {
              ok: false,
              error: "No active FCM tokens found.",
            },
            {
              status: 404,
            },
          );
        }

        const target = activeTokens[0];

        const fcmUrl =
          `https://fcm.googleapis.com/v1/projects/` +
          `${env.FIREBASE_PROJECT_ID}/messages:send`;

        const fcmResponse = await fetch(fcmUrl, {
          method: "POST",

          headers: {
            Authorization: `Bearer ${accessToken}`,

            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            message: {
              token: target.token,

              notification: {
                title: "Cloudflare FCM Test 🔔",
                body: "Cloudflare Worker is successfully sending notifications!",
              },

              data: {
                type: "cloudflare_test",
                title: "Cloudflare FCM Test 🔔",
                body: "Cloudflare Worker is successfully sending notifications!",
              },
            },
          }),
        });

        const fcmData = await fcmResponse.json();

        if (!fcmResponse.ok) {
          throw new Error(`FCM error: ${JSON.stringify(fcmData)}`);
        }

        return Response.json({
          ok: true,
          sent: true,
          userName: target.userName || null,
          uid: target.uid || null,
          messageName: fcmData.name || null,
        });
      }

      if (url.pathname === "/firebase-test") {
        const serviceAccount = await getFirebaseServiceAccount(env);

        const accessToken = await createGoogleAccessToken(serviceAccount);

        const documents = await getFirestoreDocuments(
          accessToken,
          env.FIREBASE_PROJECT_ID,
          "fcmTokens",
        );

        const activeTokens = documents
          .map((document) => {
            const fields = document.fields || {};

            return {
              token: getFirestoreFieldValue(fields, "token"),

              uid: getFirestoreFieldValue(fields, "uid"),

              userName: getFirestoreFieldValue(fields, "userName"),

              active: getFirestoreFieldValue(fields, "active"),
            };
          })
          .filter((item) => item.active === true && item.token);

        return Response.json({
          ok: true,
          firebase: true,
          firestore: true,
          project: env.FIREBASE_PROJECT_ID,
          activeTokenCount: activeTokens.length,
          users: activeTokens.map((item) => ({
            uid: item.uid,
            userName: item.userName,
          })),
        });
      }

      return Response.json(
        {
          ok: false,
          error: "Not found",
        },
        {
          status: 404,
        },
      );
    } catch (error) {
      console.error("Worker error:", error);

      return Response.json(
        {
          ok: false,
          error: error?.message || "Unknown error",
        },
        {
          status: 500,
        },
      );
    }
  },
};
