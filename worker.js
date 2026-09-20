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

async function runFirestoreQuery(accessToken, projectId, structuredQuery) {
  const url =
    `https://firestore.googleapis.com/v1/` +
    `projects/${projectId}/databases/(default)/documents:runQuery`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${accessToken}`,

      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      structuredQuery,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Firestore query error: ${JSON.stringify(data)}`);
  }

  return data.filter((item) => item.document).map((item) => item.document);
}

function firestoreDocumentToObject(document) {
  const fields = document.fields || {};

  const result = {
    id: document.name?.split("/").pop() || null,
  };

  for (const [key, value] of Object.entries(fields)) {
    if ("stringValue" in value) {
      result[key] = value.stringValue;
    } else if ("booleanValue" in value) {
      result[key] = value.booleanValue;
    } else if ("integerValue" in value) {
      result[key] = Number(value.integerValue);
    } else if ("doubleValue" in value) {
      result[key] = Number(value.doubleValue);
    } else if ("timestampValue" in value) {
      result[key] = value.timestampValue;
    } else if ("nullValue" in value) {
      result[key] = null;
    }
  }

  return result;
}

async function sendFcmNotification({
  accessToken,
  projectId,
  token,
  title,
  body,
  data = {},
}) {
  const url =
    `https://fcm.googleapis.com/v1/projects/` + `${projectId}/messages:send`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${accessToken}`,

      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      message: {
        token,

        notification: {
          title,
          body,
        },

        data: {
          ...data,
          title,
          body,
        },
      },
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`FCM send error: ${JSON.stringify(result)}`);
  }

  return result;
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
async function getFirestoreDocument(accessToken, projectId, documentPath) {
  const url =
    `https://firestore.googleapis.com/v1/projects/` +
    `${projectId}/databases/(default)/documents/${documentPath}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }

    throw new Error(`Firestore document error: ${JSON.stringify(data)}`);
  }

  return data;
}
async function setFirestoreDocumentFields(
  accessToken,
  projectId,
  documentPath,
  fields,
) {
  const fieldPaths = Object.keys(fields)
    .map((fieldPath) => encodeURIComponent(fieldPath))
    .map((fieldPath) => `updateMask.fieldPaths=${fieldPath}`)
    .join("&");

  const url =
    `https://firestore.googleapis.com/v1/projects/` +
    `${projectId}/databases/(default)/documents/${documentPath}` +
    `?${fieldPaths}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Firestore write error: ${JSON.stringify(data)}`);
  }

  return data;
}
async function markNotificationSent(
  accessToken,
  projectId,
  collectionName,
  documentId,
) {
  const documentPath = `${collectionName}/${documentId}`;

  await setFirestoreDocumentFields(accessToken, projectId, documentPath, {
    notificationSentAt: {
      timestampValue: new Date().toISOString(),
    },
  });
}
function getFirestoreTimestampValue(fields, fieldName) {
  const field = fields?.[fieldName];

  if (!field) {
    return null;
  }

  if ("timestampValue" in field) {
    return field.timestampValue;
  }

  return null;
}
async function getLastProcessedAt(accessToken, projectId) {
  const stateDocument = await getFirestoreDocument(
    accessToken,
    projectId,
    "notificationWorkerState/main",
  );

  if (!stateDocument) {
    return null;
  }

  return getFirestoreTimestampValue(stateDocument.fields, "lastProcessedAt");
}
async function saveLastProcessedAt(accessToken, projectId, timestamp) {
  await setFirestoreDocumentFields(
    accessToken,
    projectId,
    "notificationWorkerState/main",
    {
      lastProcessedAt: {
        timestampValue: timestamp,
      },
    },
  );
}
async function getNewDocuments(accessToken, projectId, collectionName, since) {
  const structuredQuery = {
    from: [
      {
        collectionId: collectionName,
      },
    ],

    orderBy: [
      {
        field: {
          fieldPath: "createdAt",
        },
        direction: "ASCENDING",
      },
    ],

    limit: 100,
  };

  if (since) {
    structuredQuery.where = {
      fieldFilter: {
        field: {
          fieldPath: "createdAt",
        },

        op: "GREATER_THAN",

        value: {
          timestampValue: since,
        },
      },
    };
  }

  const documents = await runFirestoreQuery(
    accessToken,
    projectId,
    structuredQuery,
  );

  return documents;
}
async function getActiveFcmTokens(accessToken, projectId) {
  const documents = await getFirestoreDocuments(
    accessToken,
    projectId,
    "fcmTokens",
  );

  return documents
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
  async scheduled(controller, env, ctx) {
    try {
      console.log("Notification Cron started.");

      const serviceAccount = await getFirebaseServiceAccount(env);

      const accessToken = await createGoogleAccessToken(serviceAccount);

      const projectId = env.FIREBASE_PROJECT_ID;

      const now = new Date().toISOString();

      let lastProcessedAt = await getLastProcessedAt(accessToken, projectId);

      /*
       * First run:
       *
       * Do not process old Tasks/Mentions.
       * Start from approximately one minute before now.
       */
      if (!lastProcessedAt) {
        lastProcessedAt = new Date(Date.now() - 60 * 1000).toISOString();

        console.log(
          "No previous cursor found. Starting from:",
          lastProcessedAt,
        );
      } else {
        console.log("Last processed:", lastProcessedAt);
      }

      const [taskDocuments, mentionDocuments, activeTokens] = await Promise.all(
        [
          getNewDocuments(accessToken, projectId, "tasks", lastProcessedAt),

          getNewDocuments(accessToken, projectId, "mentions", lastProcessedAt),

          getActiveFcmTokens(accessToken, projectId),
        ],
      );

      console.log(`Found ${taskDocuments.length} new task(s).`);

      console.log(`Found ${activeTokens.length} active FCM token(s).`);

      console.log(`Found ${mentionDocuments.length} new mention(s).`);

      /*
       * --------------------------------------------------
       * TASK NOTIFICATIONS
       * --------------------------------------------------
       */

      for (const document of taskDocuments) {
        const task = firestoreDocumentToObject(document);

        const alreadySent = document.fields?.notificationSentAt;

        if (alreadySent) {
          console.log(`Skipping task ${task.id} - notification already sent.`);

          continue;
        }

        const taskTitle = task.title || task.name || "New Task";

        const taskDescription = task.description || "";

        const title = "New Task 📋";

        const body = taskDescription
          ? `${taskTitle} — ${taskDescription}`
          : taskTitle;

        console.log(`Sending task notification: ${task.id}`);

        // const tokenDocuments = await getFirestoreDocuments(
        //   accessToken,
        //   projectId,
        //   "fcmTokens",
        // );

        // const activeTokens = tokenDocuments
        //   .map((tokenDocument) => {
        //     const fields = tokenDocument.fields || {};

        //     return {
        //       token: getFirestoreFieldValue(fields, "token"),

        //       active: getFirestoreFieldValue(fields, "active"),
        //     };
        //   })
        //   .filter((item) => item.active === true && item.token);

        for (const target of activeTokens) {
          try {
            await sendFcmNotification({
              accessToken,
              projectId,
              token: target.token,

              title,

              body,

              data: {
                type: "task_created",
                taskId: task.id,
              },
            });
          } catch (error) {
            console.error(`Failed to send task notification to token:`, error);
          }
        }

        await markNotificationSent(accessToken, projectId, "tasks", task.id);

        console.log(`Task ${task.id} marked as notified.`);
      }

      /*
       * --------------------------------------------------
       * MENTION NOTIFICATIONS
       * --------------------------------------------------
       */

      for (const document of mentionDocuments) {
        const mention = firestoreDocumentToObject(document);

        const alreadySent = document.fields?.notificationSentAt;

        if (alreadySent) {
          console.log(
            `Skipping mention ${mention.id} - notification already sent.`,
          );

          continue;
        }

        const mentionType = mention.type || "Mention";

        const mentionUrl = mention.url || "";

        const title = "New Mention 🔔";

        const body = mentionUrl
          ? `${mentionType}: ${mentionUrl}`
          : `A new ${mentionType} is available.`;

        console.log(`Sending mention notification: ${mention.id}`);

        // const tokenDocuments = await getFirestoreDocuments(
        //   accessToken,
        //   projectId,
        //   "fcmTokens",
        // );

        // const activeTokens = tokenDocuments
        //   .map((tokenDocument) => {
        //     const fields = tokenDocument.fields || {};

        //     return {
        //       token: getFirestoreFieldValue(fields, "token"),

        //       active: getFirestoreFieldValue(fields, "active"),
        //     };
        //   })
        //   .filter((item) => item.active === true && item.token);

        for (const target of activeTokens) {
          try {
            await sendFcmNotification({
              accessToken,
              projectId,
              token: target.token,

              title,

              body,

              data: {
                type: "mention_created",
                mentionId: mention.id,
              },
            });
          } catch (error) {
            console.error(
              `Failed to send mention notification to token:`,
              error,
            );
          }
        }

        await markNotificationSent(
          accessToken,
          projectId,
          "mentions",
          mention.id,
        );

        console.log(`Mention ${mention.id} marked as notified.`);
      }

      /*
       * --------------------------------------------------
       * SAVE CURSOR
       * --------------------------------------------------
       */

      await saveLastProcessedAt(accessToken, projectId, now);

      console.log("Notification Cron completed successfully.");
    } catch (error) {
      console.error("Notification Cron failed:", error);

      throw error;
    }
  },
};
