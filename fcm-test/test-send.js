const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function main() {
  console.log("FCM Test Sender started...\n");

  const snapshot = await db
    .collection("fcmTokens")
    .where("active", "==", true)
    .get();

  if (snapshot.empty) {
    console.log("❌ No active FCM tokens found.");
    process.exit(1);
  }

  console.log(`Found ${snapshot.size} active token(s).\n`);

  // For the first test, send only to ONE device.
  const firstDoc = snapshot.docs[0];
  const tokenData = firstDoc.data();

  console.log("Target device:");
  console.log("User:", tokenData.userName || "Unknown");
  console.log("UID:", tokenData.uid || "Unknown");
  console.log("Token ID:", firstDoc.id);
  console.log("");

  const message = {
    token: tokenData.token,

    notification: {
      title: "FCM Test 🔔",
      body: "Local FCM Test Sender is working!",
    },

    data: {
      type: "test",
      title: "FCM Test 🔔",
      body: "Local FCM Test Sender is working!",
    },
  };

  try {
    const response = await getMessaging().send(message);

    console.log("✅ Notification sent successfully!");
    console.log("Message ID:", response);
  } catch (error) {
    console.error("❌ Failed to send notification:");
    console.error(error);
  }
}

main();
