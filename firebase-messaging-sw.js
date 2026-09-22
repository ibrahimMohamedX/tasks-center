importScripts(
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js",
);

importScripts(
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js",
);

const firebaseConfig = {
  apiKey: "AIzaSyAreXF_U51NYnqtLHZ37vU41b9Rv3M00gs",
  authDomain: "archai-tasks-manager.firebaseapp.com",
  projectId: "archai-tasks-manager",
  storageBucket: "archai-tasks-manager.firebasestorage.app",
  messagingSenderId: "127267057347",
  appId: "1:127267057347:web:edb04505a80eba36d47c76",
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Background message:", payload);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};

  let url = "/";

  if (data.taskId) {
    url = `/admin.html?task=${encodeURIComponent(data.taskId)}`;
  }

  if (data.mentionId) {
    url = `/admin.html?mention=${encodeURIComponent(data.mentionId)}`;
  }

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);

            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      }),
  );
});
