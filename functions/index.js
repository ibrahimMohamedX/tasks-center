const {
  onDocumentCreated,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");

const { onSchedule } = require("firebase-functions/v2/scheduler");

const { initializeApp } = require("firebase-admin/app");

const {
  getFirestore,
  FieldValue,
  Timestamp,
} = require("firebase-admin/firestore");

const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const db = getFirestore();

const TOKENS_COLLECTION = "fcmTokens";
const NOTIFICATIONS_COLLECTION = "notifications";

/**
 * Get all active FCM tokens.
 */
async function getActiveTokens() {
  const snapshot = await db
    .collection(TOKENS_COLLECTION)
    .where("active", "==", true)
    .get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter((item) => item.token && item.uid);
}

/**
 * Create notification document
 * and send push notification to all active users.
 */
async function createAndSendNotification({
  type,
  title,
  message,
  taskId = null,
  mentionId = null,
  createdBy = null,
  createdByName = null,
}) {
  const tokens = await getActiveTokens();

  if (tokens.length === 0) {
    return;
  }

  /**
   * Save notification in Firestore.
   */
  const notificationRef = db.collection(NOTIFICATIONS_COLLECTION).doc();

  await notificationRef.set({
    type,
    title,
    message,
    taskId,
    mentionId,
    createdBy,
    createdByName,
    createdAt: FieldValue.serverTimestamp(),
  });

  /**
   * Extract FCM tokens.
   */
  const tokenValues = tokens.map((item) => item.token);

  /**
   * Send push notification.
   */
  const response = await getMessaging().sendEachForMulticast({
    tokens: tokenValues,

    notification: {
      title,
      body: message,
    },

    data: {
      type,
      taskId: taskId || "",
      mentionId: mentionId || "",
    },

    webpush: {
      notification: {
        title,
        body: message,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
      },

      fcmOptions: {
        link: mentionId
          ? `/employee.html?mention=${mentionId}`
          : taskId
            ? `/employee.html?task=${taskId}`
            : "/",
      },
    },
  });

  /**
   * Deactivate invalid FCM tokens.
   */
  const invalidTokens = [];

  response.responses.forEach((result, index) => {
    if (!result.success) {
      const code = result.error?.code || "";

      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token")
      ) {
        invalidTokens.push(tokens[index].id);
      }
    }
  });

  if (invalidTokens.length > 0) {
    const batch = db.batch();

    invalidTokens.forEach((tokenId) => {
      batch.update(db.collection(TOKENS_COLLECTION).doc(tokenId), {
        active: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
  }
}

/* ============================================================
   TASK CREATED
   ============================================================ */

exports.notifyTaskCreated = onDocumentCreated(
  "tasks/{taskId}",
  async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      return;
    }

    const task = snapshot.data();

    await createAndSendNotification({
      type: "task_created",

      title: "New Task",

      message: `${task.createdByName || "Someone"} ` + "created a new task.",

      taskId: snapshot.id,

      createdBy: task.createdBy || null,

      createdByName: task.createdByName || null,
    });
  },
);

/* ============================================================
   MENTION CREATED
   ============================================================ */

exports.notifyMentionCreated = onDocumentCreated(
  "mentions/{mentionId}",
  async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      return;
    }

    const mention = snapshot.data();

    await createAndSendNotification({
      type: "mention_created",

      title: "New Mention",

      message:
        `${mention.createdByName || "Someone"} ` +
        "created a new Facebook mention.",

      mentionId: snapshot.id,

      createdBy: mention.createdBy || null,

      createdByName: mention.createdByName || null,
    });
  },
);

/* ============================================================
   MENTION REACTIVATED
   ============================================================ */

exports.notifyMentionReactivated = onDocumentUpdated(
  "mentions/{mentionId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (!before || !after) {
      return;
    }

    /*
     * Reactivation is identified by
     * reactivatedAt changing.
     */

    const beforeReactivatedAt = before.reactivatedAt || null;

    const afterReactivatedAt = after.reactivatedAt || null;

    if (!afterReactivatedAt) {
      return;
    }

    const beforeMillis = beforeReactivatedAt?.toMillis?.() || 0;

    const afterMillis = afterReactivatedAt?.toMillis?.() || 0;

    if (afterMillis <= beforeMillis) {
      return;
    }

    await createAndSendNotification({
      type: "mention_reactivated",

      title: "Mention Reactivated",

      message: "An expired mention is available again.",

      mentionId: event.params.mentionId,
    });
  },
);

/* ============================================================
   MENTION OPENED
   ============================================================ */

exports.processMentionOpenNotifications = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "Africa/Cairo",
  },

  async () => {
    const now = Timestamp.now();

    const snapshot = await db
      .collection("mentions")
      .where("openNotificationSentAt", "==", null)
      .get();

    if (snapshot.empty) {
      return;
    }

    for (const mentionDoc of snapshot.docs) {
      const mention = mentionDoc.data();

      /*
       * Ignore already expired Mentions.
       */

      if (mention.expiresAt && mention.expiresAt.toMillis() <= now.toMillis()) {
        continue;
      }

      /*
       * If current execution lock is still active,
       * the Mention is not open yet.
       */

      if (mention.lockUntil && mention.lockUntil.toMillis() > now.toMillis()) {
        continue;
      }

      /*
       * Initial lock.
       */

      if (mention.unlockAt && mention.unlockAt.toMillis() > now.toMillis()) {
        continue;
      }

      /*
       * If everybody already completed,
       * don't notify.
       */

      const queue = Array.isArray(mention.queue) ? mention.queue : [];

      const completedBy = Array.isArray(mention.completedBy)
        ? mention.completedBy
        : [];

      const totalParticipants = Number(mention.totalParticipants) || 0;

      if (
        totalParticipants > 0 &&
        completedBy.length >= totalParticipants &&
        queue.length === 0
      ) {
        continue;
      }

      /*
       * Send notification.
       */

      await createAndSendNotification({
        type: "mention_opened",

        title: "Mention Available",

        message: "A Facebook mention is now available.",

        mentionId: mentionDoc.id,
      });

      /*
       * Mark notification as sent.
       *
       * This prevents the same Mention
       * from sending repeatedly every minute.
       */

      await mentionDoc.ref.update({
        openNotificationSentAt: FieldValue.serverTimestamp(),
      });
    }
  },
);
