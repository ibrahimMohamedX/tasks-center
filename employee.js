// ============================================================
// TaskFlow Employee
// ============================================================

import {
  listenToAuthState,
  logoutUser,
  getUser,
  getReadableFirebaseError,
  createMention,
  // watchMentions,
  getMentions,
  getMentionStatus,
  claimMention,
  completeMention,
  registerPushNotifications,
  listenForForegroundNotifications,
  convertFirebaseDate,
} from "./firebase.js";

// ============================================================
// STATE
// ============================================================

const state = {
  authUser: null,
  profile: null,

  mentions: [],

  // mentionUnsubscribe: null,
  mentionCountdownInterval: null,

  loading: false,
};

// ============================================================
// DOM
// ============================================================

const elements = {
  userName: document.getElementById("userName"),

  userEmail: document.getElementById("userEmail"),

  userAvatar: document.getElementById("userAvatar"),

  welcomeName: document.getElementById("welcomeName"),

  refreshButton: document.getElementById("refreshButton"),

  logoutButton: document.getElementById("logoutButton"),

  toast: document.getElementById("toast"),

  toastTitle: document.getElementById("toastTitle"),

  toastMessage: document.getElementById("toastMessage"),

  closeToast: document.getElementById("closeToast"),

  employeeAddMentionButton: document.getElementById("employeeAddMentionButton"),

  employeeMentionForm: document.getElementById("employeeMentionForm"),

  employeeMentionsList: document.getElementById("employeeMentionsList"),

  employeeMentionModal: document.getElementById("employeeMentionModal"),

  employeeMentionDetailsModal: document.getElementById(
    "employeeMentionDetailsModal",
  ),

  employeeMentionDetailsContent: document.getElementById(
    "employeeMentionDetailsContent",
  ),
};

// ============================================================
// INIT
// ============================================================

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  setupNavigation();
  setupMobileSidebar();
  setupActions();
  setupModal();

  startEmployeeMentionCountdown();

  listenToAuthentication();
}

// ============================================================
// AUTH
// ============================================================

function listenToAuthentication() {
  listenToAuthState(async (user) => {
    if (!user) {
      window.location.replace("login.html");

      return;
    }

    state.authUser = user;

    await initializeEmployee(user.uid);
  });
}

async function initializeEmployee(userId) {
  try {
    setLoading(true);

    const profile = await getUser(userId);

    if (!profile) {
      await logoutUser();

      window.location.replace("login.html");

      return;
    }

    if (profile.active === false) {
      showToast("Account disabled", "Your account is disabled.", "error");

      await logoutUser();

      window.location.replace("login.html");

      return;
    }

    if (profile.role !== "employee") {
      showToast("Access denied", "This page is for employees only.", "error");

      setTimeout(() => {
        window.location.replace("admin.html");
      }, 900);

      return;
    }

    await setupPushNotifications();

    state.profile = profile;

    renderUserProfile();

    await initializeEmployeeMentions();
  } catch (error) {
    console.error("Employee initialization error:", error);

    showToast("Error", getReadableFirebaseError(error), "error");
  } finally {
    setLoading(false);
  }
}
// ============================================================
// PROFILE
// ============================================================

function renderUserProfile() {
  const name = state.profile?.name || state.authUser?.displayName || "Employee";

  const email = state.profile?.email || state.authUser?.email || "";

  elements.userName.textContent = name;

  elements.userEmail.textContent = email;

  elements.welcomeName.textContent = getFirstName(name);

  elements.userAvatar.textContent = getInitials(name);
}

// ============================================================
// EMPLOYEE MENTIONS
// ============================================================

// async function initializeEmployeeMentions() {
//   try {
//     if (state.mentionUnsubscribe) {
//       state.mentionUnsubscribe();
//     }

//     state.mentionUnsubscribe = watchMentions((mentions) => {
//       state.mentions = mentions;

//       renderEmployeeMentions();
//       refreshEmployeeMentionDetails();
//     });
//   } catch (error) {
//     console.error("Employee Mentions initialization error:", error);

//     showToast("Mentions Error", getReadableFirebaseError(error), "error");
//   }
// }

async function initializeEmployeeMentions() {
  try {
    const mentions = await getMentions();

    state.mentions = mentions;

    renderEmployeeMentions();
    refreshEmployeeMentionDetails();
  } catch (error) {
    console.error("Employee Mentions initialization error:", error);

    showToast("Mentions Error", getReadableFirebaseError(error), "error");
  }
}

function renderEmployeeMentions() {
  if (!elements.employeeMentionsList) {
    return;
  }

  if (!state.mentions.length) {
    elements.employeeMentionsList.innerHTML = createEmptyState(
      "No Mentions yet",
      "There are no Mentions available.",
    );

    return;
  }

  elements.employeeMentionsList.innerHTML = state.mentions
    .map((mention) => createEmployeeMentionCard(mention))
    .join("");
}

function createEmployeeMentionCard(mention) {
  const status = getMentionStatus(mention);

  const currentUid = state.authUser?.uid;

  const isCreator = mention.createdBy === currentUid;

  const completedBy = Array.isArray(mention.completedBy)
    ? mention.completedBy
    : [];

  const queue = Array.isArray(mention.queue) ? mention.queue : [];

  const completedByMe = completedBy.some((item) => item.uid === currentUid);

  const pendingForMe = queue.some((item) => item.uid === currentUid);

  const claimedByMe = mention.currentLocker?.uid === currentUid;

  const locker = mention.currentLocker?.name || "";

  let action = "";

  if (completedByMe) {
    action = `
      <span class="mention-personal-state compact completed">
        <i class="fa-solid fa-circle-check"></i>
        Completed by you
      </span>
    `;
  } else if (isCreator) {
    action = `
      <span class="mention-personal-state compact creator">
        <i class="fa-solid fa-user-check"></i>
        You created this Mention
      </span>
    `;
  } else if (claimedByMe) {
    action = `
      <button
        type="button"
        class="mention-action mention-action-primary"
        data-complete-mention="${escapeHtml(mention.id)}"
      >
        <i class="fa-solid fa-check"></i>
        Complete
      </button>
    `;
  } else if (pendingForMe && status === "open") {
    action = `
      <button
        type="button"
        class="mention-action mention-action-primary"
        data-claim-mention="${escapeHtml(mention.id)}"
      >
        <i class="fa-solid fa-play"></i>
        Execute
      </button>
    `;
  } else if (pendingForMe && status === "locked") {
    action = `
      <span class="mention-personal-state compact waiting">
        <i class="fa-solid fa-lock"></i>
        Waiting for availability
      </span>
    `;
  } else if (!pendingForMe && !completedByMe && !isCreator) {
    action = `
      <span class="mention-personal-state compact">
        Not required
      </span>
    `;
  }

  return `
    <article
      class="mention-card"
      data-employee-mention-details="${escapeHtml(mention.id)}"
    >

      <div class="mention-card-top">

        <div class="mention-card-title">

          <span class="mention-type">
            <i class="fa-solid fa-at"></i>
            Facebook Mention
          </span>

          <h3 title="${escapeAttribute(mention.url || "")}">
            ${escapeHtml(mention.url || "Unknown URL")}
          </h3>

        </div>

        ${createEmployeeMentionBadge(status)}

      </div>

      <div class="mention-card-info">

        <span>
          <i class="fa-solid fa-user"></i>
          ${escapeHtml(mention.createdByName || "Unknown")}
        </span>

        <span>
          <i class="fa-solid fa-users"></i>
          ${completedBy.length}/${mention.totalParticipants || 0}
        </span>

        ${
          locker
            ? `
              <span>
                <i class="fa-solid fa-lock"></i>
                ${escapeHtml(locker)}
              </span>
            `
            : ""
        }

        <span class="mention-card-time">
          ${
            status === "locked"
              ? `
                <span
                  class="mention-countdown"
                  data-employee-countdown="${escapeHtml(mention.id)}"
                  data-status="${escapeHtml(status)}"
                >
                  ${getEmployeeMentionCountdown(mention)}
                </span>
              `
              : status === "open"
                ? `
                  <span class="mention-open-text">
                    <i class="fa-solid fa-circle"></i>
                    Available now
                  </span>
                `
                : status === "expired"
                  ? `
                    <span>
                      <i class="fa-solid fa-clock"></i>
                      Expired
                    </span>
                  `
                  : `
                    <span>
                      <i class="fa-solid fa-check-double"></i>
                      Completed
                    </span>
                  `
          }
        </span>

      </div>

      <div class="mention-card-bottom">

        <span class="mention-card-progress">
          ${queue.length} pending · ${completedBy.length} completed
        </span>

        <div class="mention-card-actions">

          ${action}

          <button
            type="button"
            class="mention-action mention-action-secondary"
            data-employee-details="${escapeHtml(mention.id)}"
          >
            Details
          </button>

        </div>

      </div>

    </article>
  `;
}

function createEmployeeMentionBadge(status) {
  const labels = {
    locked: "LOCKED",
    open: "OPEN",
    expired: "EXPIRED",
    completed: "COMPLETED",
  };

  return `
    <span class="mention-status-badge ${status}">
      ${labels[status] || "UNKNOWN"}
    </span>
  `;
}

function getEmployeeMentionCountdown(mention) {
  const status = getMentionStatus(mention);

  if (status === "open") {
    return "Available now";
  }

  if (status === "expired") {
    return "Expired";
  }

  if (status === "completed") {
    return "Completed";
  }

  const target = mention.lockUntil
    ? convertFirebaseDate(mention.lockUntil)
    : convertFirebaseDate(mention.unlockAt);

  if (!target) {
    return "Waiting...";
  }

  const diff = target.getTime() - Date.now();

  if (diff <= 0) {
    return "Updating...";
  }

  if (mention.currentLocker && mention.lockReason === "execution") {
    return `Currently locked · ${formatMentionDuration(diff)}`;
  }

  return `Opens in ${formatMentionDuration(diff)}`;
}

function formatMentionDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));

  const hours = Math.floor(totalSeconds / 3600);

  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function startEmployeeMentionCountdown() {
  if (state.mentionCountdownInterval) {
    clearInterval(state.mentionCountdownInterval);
  }

  state.mentionCountdownInterval = setInterval(() => {
    document
      .querySelectorAll("[data-employee-countdown]")
      .forEach((element) => {
        const mention = state.mentions.find(
          (item) => item.id === element.dataset.employeeCountdown,
        );

        if (!mention) {
          return;
        }

        const nextStatus = getMentionStatus(mention);

        const previousStatus = element.dataset.status;

        if (previousStatus !== nextStatus) {
          element.dataset.status = nextStatus;

          renderEmployeeMentions();

          return;
        }

        element.textContent = getEmployeeMentionCountdown(mention);
      });
  }, 1000);
}

async function handleEmployeeCreateMention(event) {
  event.preventDefault();

  const submitButton = elements.employeeMentionForm?.querySelector(
    'button[type="submit"]',
  );

  const url = document.getElementById("employeeMentionUrl")?.value || "";

  const description =
    document.getElementById("employeeMentionDescription")?.value || "";

  try {
    if (submitButton) {
      submitButton.disabled = true;
    }

    await createMention({
      url,
      description,
    });

    elements.employeeMentionForm.reset();

    closeEmployeeMentionModal();

    showToast("Mention created", "The Mention was created successfully.");
  } catch (error) {
    console.error("Employee create Mention error:", error);

    showToast(
      "Unable to create Mention",
      getReadableFirebaseError(error),
      "error",
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

async function handleClaimMention(mentionId) {
  try {
    const updatedMention = await claimMention(mentionId);

    state.mentions = state.mentions.map((m) =>
      m.id === mentionId ? updatedMention : m,
    );

    renderEmployeeMentions();
    refreshEmployeeMentionDetails();

    showToast("Mention claimed", "You can now execute this Mention.");
  } catch (error) {
    console.error("Claim Mention error:", error);

    showToast("Mention unavailable", getReadableFirebaseError(error), "error");
  }
}

async function handleCompleteMention(mentionId) {
  try {
    const updatedMention = await completeMention(mentionId);

    state.mentions = state.mentions.map((m) =>
      m.id === mentionId ? updatedMention : m,
    );

    renderEmployeeMentions();
    refreshEmployeeMentionDetails();

    showToast("Mention completed", "Your participation has been recorded.");
  } catch (error) {
    console.error("Complete Mention error:", error);

    showToast(
      "Unable to complete Mention",
      getReadableFirebaseError(error),
      "error",
    );
  }
}

function openEmployeeMentionDetails(mentionId) {
  const mention = state.mentions.find((item) => item.id === mentionId);

  if (!mention) {
    showToast("Mention not found", "This Mention no longer exists.", "error");

    return;
  }

  const status = getMentionStatus(mention);

  const currentUid = state.authUser?.uid;

  const completed = Array.isArray(mention.completedBy)
    ? mention.completedBy
    : [];

  const queue = Array.isArray(mention.queue) ? mention.queue : [];

  const isCreator = mention.createdBy === currentUid;

  const completedByMe = completed.some((item) => item.uid === currentUid);

  const claimedByMe = mention.currentLocker?.uid === currentUid;

  const pendingForMe = queue.some((item) => item.uid === currentUid);

  let personalState = "";

  if (isCreator) {
    personalState =
      "You created this Mention. You are not required to execute it.";
  } else if (completedByMe) {
    personalState = "You have already completed this Mention.";
  } else if (claimedByMe) {
    personalState = "You currently have the execution lock.";
  } else if (pendingForMe) {
    personalState = "You are still pending for this Mention.";
  } else {
    personalState = "You are not required to execute this Mention.";
  }

  elements.employeeMentionDetailsModal.dataset.mentionId = mentionId;

  elements.employeeMentionDetailsContent.innerHTML = `
    <div class="mention-details">
      <div class="mention-detail-url">
        <span>Facebook URL</span>

        <a
          href="${escapeAttribute(mention.url || "#")}"
          target="_blank"
          rel="noopener noreferrer"
        >
          ${escapeHtml(mention.url || "—")}
        </a>
      </div>

      <div class="mention-details-grid">
        <div>
          <span>Status</span>
          ${createEmployeeMentionBadge(status)}
        </div>

        <div>
          <span>Created by</span>
          <strong>
            ${escapeHtml(mention.createdByName || "Unknown")}
          </strong>
        </div>

        <div>
          <span>Created at</span>
          <strong>
            ${formatDateTime(mention.createdAt)}
          </strong>
        </div>

        <div>
          <span>Expires at</span>
          <strong>
            ${formatDateTime(mention.expiresAt)}
          </strong>
        </div>
      </div>

      <div class="mention-detail-section">
        <h3>Your status</h3>

        <div class="participant-item ${completedByMe ? "completed" : ""}">
          ${escapeHtml(personalState)}
        </div>
      </div>

      <div class="mention-detail-section">
        <h3>Participants</h3>

        <div class="participant-list">
          ${completed
            .map(
              (item) => `
                <div class="participant-item completed">
                  <span>
                    <i class="fa-solid fa-check"></i>
                    ${escapeHtml(item.name || "Unknown")}
                  </span>

                  <strong>
                    Completed
                  </strong>
                </div>
              `,
            )
            .join("")}

          ${queue
            .map(
              (item) => `
                <div class="participant-item pending">
                  <span>
                    <i class="fa-regular fa-clock"></i>
                    ${escapeHtml(item.name || "Unknown")}
                  </span>

                  <strong>
                    Waiting
                  </strong>
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;

  elements.employeeMentionDetailsModal?.classList.add("active");

  document.body.style.overflow = "hidden";
}

function refreshEmployeeMentionDetails() {
  const modal = elements.employeeMentionDetailsModal;

  if (!modal || !modal.classList.contains("active")) {
    return;
  }

  const mentionId = modal.dataset.mentionId;

  if (mentionId) {
    openEmployeeMentionDetails(mentionId);
  }
}

// ============================================================
// NAVIGATION
// ============================================================

function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      showSection(item.dataset.section);
    });
  });
}

function showSection(section) {
  document
    .querySelectorAll(".page-section")
    .forEach((item) => item.classList.remove("active"));

  document.getElementById(`${section}Section`)?.classList.add("active");

  document
    .querySelectorAll(".nav-item")
    .forEach((item) =>
      item.classList.toggle("active", item.dataset.section === section),
    );
}

// ============================================================
// ACTIONS
// ============================================================

function setupActions() {
  elements.refreshButton?.addEventListener("click", initializeEmployeeMentions);

  elements.logoutButton?.addEventListener("click", async () => {
    try {
      await logoutUser();

      window.location.replace("login.html");
    } catch (error) {
      console.error("Logout error:", error);
    }
  });

  elements.employeeAddMentionButton?.addEventListener(
    "click",
    openEmployeeMentionModal,
  );

  elements.employeeMentionForm?.addEventListener(
    "submit",
    handleEmployeeCreateMention,
  );

  document.addEventListener("click", (event) => {
    const claimButton = event.target.closest("[data-claim-mention]");

    if (claimButton) {
      handleClaimMention(claimButton.dataset.claimMention);

      return;
    }

    const completeButton = event.target.closest("[data-complete-mention]");

    if (completeButton) {
      handleCompleteMention(completeButton.dataset.completeMention);

      return;
    }

    const detailsButton = event.target.closest("[data-employee-details]");

    if (detailsButton) {
      openEmployeeMentionDetails(detailsButton.dataset.employeeDetails);

      return;
    }
  });

  document
    .querySelectorAll("[data-close-employee-mention]")
    .forEach((button) => {
      button.addEventListener("click", closeEmployeeMentionModal);
    });

  document
    .querySelectorAll("[data-close-employee-details]")
    .forEach((button) => {
      button.addEventListener("click", closeEmployeeMentionDetails);
    });

  elements.employeeMentionModal?.addEventListener("click", (event) => {
    if (event.target === elements.employeeMentionModal) {
      closeEmployeeMentionModal();
    }
  });

  elements.employeeMentionDetailsModal?.addEventListener("click", (event) => {
    if (event.target === elements.employeeMentionDetailsModal) {
      closeEmployeeMentionDetails();
    }
  });
}

// ============================================================
// MODAL
// ============================================================

function setupModal() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });

  elements.closeToast?.addEventListener("click", hideToast);
}

function openModal() {
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.body.style.overflow = "";
}

function openEmployeeMentionModal() {
  elements.employeeMentionModal?.classList.add("active");

  document.body.style.overflow = "hidden";
}

function closeEmployeeMentionModal() {
  elements.employeeMentionModal?.classList.remove("active");

  if (!elements.employeeMentionDetailsModal?.classList.contains("active")) {
    document.body.style.overflow = "";
  }
}

function closeEmployeeMentionDetails() {
  elements.employeeMentionDetailsModal?.classList.remove("active");

  if (!elements.employeeMentionModal?.classList.contains("active")) {
    document.body.style.overflow = "";
  }
}

// ============================================================
// TOAST
// ============================================================

let toastTimer = null;

function showToast(title, message, type = "success") {
  if (!elements.toast) {
    return;
  }

  elements.toastTitle.textContent = title;

  elements.toastMessage.textContent = message;

  const icon = elements.toast.querySelector(".toast-icon i");

  if (type === "error") {
    icon.className = "fa-solid fa-circle-exclamation";

    elements.toast.classList.add("error");
  } else {
    icon.className = "fa-solid fa-check";

    elements.toast.classList.remove("error");
  }

  elements.toast.classList.add("active");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(hideToast, 4500);
}

function hideToast() {
  elements.toast?.classList.remove("active");
}

// ============================================================
// LOADING
// ============================================================

function setLoading(isLoading) {
  state.loading = isLoading;
}

// ============================================================
// HELPERS
// ============================================================

function formatDateTime(value) {
  const date = convertFirebaseDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function createEmptyState(title, message) {
  return `
    <div class="empty-state">

      <div class="empty-state-icon">
        <i class="fa-regular fa-folder-open"></i>
      </div>

      <strong>
        ${escapeHtml(title)}
      </strong>

      <p>
        ${escapeHtml(message)}
      </p>

    </div>
  `;
}

function getFirstName(name) {
  if (!name) {
    return "there";
  }

  return name.trim().split(/\s+/)[0];
}

function getInitials(name) {
  if (!name) {
    return "U";
  }

  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function setupMobileSidebar() {
  const menuButton = document.getElementById("mobileMenuButton");
  const closeButton = document.getElementById("mobileSidebarClose");
  const overlay = document.getElementById("mobileSidebarOverlay");

  if (!menuButton || !closeButton || !overlay) {
    return;
  }

  const openSidebar = () => {
    document.body.classList.add("sidebar-open");
  };

  const closeSidebar = () => {
    document.body.classList.remove("sidebar-open");
  };

  menuButton.addEventListener("click", openSidebar);
  closeButton.addEventListener("click", closeSidebar);
  overlay.addEventListener("click", closeSidebar);

  // Close sidebar after selecting a navigation item on mobile.
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", closeSidebar);
  });

  // Close with Escape.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSidebar();
    }
  });
}
// ============================================================
// NOTIFICATIONS
// ============================================================
async function setupPushNotifications() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./firebase-messaging-sw.js");

    await registerPushNotifications();

    await listenForForegroundNotifications((payload) => {
      console.log("Foreground notification:", payload);

      showNotificationToast(payload);
    });
  } catch (error) {
    console.error("Push notification setup failed:", error);
  }
}

function showNotificationToast(payload) {
  const notification = payload.notification || {};

  const title = notification.title || "New Notification";

  const message = notification.body || "";

  if (typeof showToast === "function") {
    showToast(title, message);

    return;
  }

  console.log(`${title}: ${message}`);
}
