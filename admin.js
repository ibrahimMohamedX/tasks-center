// ============================================================
// TaskFlow Admin
// ============================================================

import {
  listenToAuthState,
  logoutUser,
  getUser,
  getUsers,
  getAllTasks,
  createUser,
  updateUser,
  createTask,
  calculateTaskStatus,
  convertFirebaseDate,
  getReadableFirebaseError,
  createMention,
  getMentions,
  watchMentions,
  getMentionStatus,
  claimMention,
  completeMention,
  reactivateMention,
  getMentionSettings,
  updateMentionSettings,
  getMentionAnalytics,
  registerPushNotifications,
  listenForForegroundNotifications,
} from "./firebase.js";

// ============================================================
// STATE
// ============================================================

const state = {
  authUser: null,
  profile: null,

  users: [],
  tasks: [],
  mentions: [],

  taskFilter: "all",
  taskUserFilter: "all",

  mentionUnsubscribe: null,
  mentionCountdownInterval: null,

  loading: false,
};

// ============================================================
// DOM
// ============================================================

const el = {
  userName: document.getElementById("userName"),

  userEmail: document.getElementById("userEmail"),

  userAvatar: document.getElementById("userAvatar"),

  totalTasks: document.getElementById("totalTasks"),

  pendingTasks: document.getElementById("pendingTasks"),

  completedTasks: document.getElementById("completedTasks"),

  expiredTasks: document.getElementById("expiredTasks"),

  recentTasks: document.getElementById("recentTasks"),

  teamOverview: document.getElementById("teamOverview"),

  adminTasks: document.getElementById("adminTasks"),

  usersTableBody: document.getElementById("usersTableBody"),

  taskUserFilter: document.getElementById("taskUserFilter"),

  assignedTo: document.getElementById("assignedTo"),

  taskForm: document.getElementById("taskForm"),

  userForm: document.getElementById("userForm"),

  editUserForm: document.getElementById("editUserForm"),

  taskModal: document.getElementById("taskModal"),

  userModal: document.getElementById("userModal"),

  editUserModal: document.getElementById("editUserModal"),

  addTaskButton: document.getElementById("addTaskButton"),

  dashboardAddTaskButton: document.getElementById("dashboardAddTaskButton"),

  addUserButton: document.getElementById("addUserButton"),

  refreshButton: document.getElementById("refreshButton"),

  logoutButton: document.getElementById("logoutButton"),

  toast: document.getElementById("toast"),

  toastTitle: document.getElementById("toastTitle"),

  toastMessage: document.getElementById("toastMessage"),

  closeToast: document.getElementById("closeToast"),

  addMentionButton: document.getElementById("addMentionButton"),

  mentionForm: document.getElementById("mentionForm"),

  mentionSettingsForm: document.getElementById("mentionSettingsForm"),

  mentionLockDuration: document.getElementById("mentionLockDuration"),

  adminMentionsList: document.getElementById("adminMentionsList"),

  mentionPerformanceBody: document.getElementById("mentionPerformanceBody"),

  mentionModal: document.getElementById("mentionModal"),

  mentionDetailsModal: document.getElementById("mentionDetailsModal"),

  mentionDetailsContent: document.getElementById("mentionDetailsContent"),

  mentionDetailsTitle: document.getElementById("mentionDetailsTitle"),

  mentionTotal: document.getElementById("mentionTotal"),
  mentionActive: document.getElementById("mentionActive"),
  mentionOpen: document.getElementById("mentionOpen"),
  mentionLocked: document.getElementById("mentionLocked"),
  mentionExpired: document.getElementById("mentionExpired"),
  mentionCompleted: document.getElementById("mentionCompleted"),
};

// ============================================================
// INIT
// ============================================================

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  setupNavigation();
  setupMobileSidebar();
  setupFilters();
  setupModals();
  setupActions();

  startMentionCountdown();

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

    await initializeAdmin(user.uid);
  });
}

async function initializeAdmin(userId) {
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

    if (profile.role !== "admin") {
      showToast(
        "Access denied",
        "This account is not an administrator.",
        "error",
      );

      setTimeout(() => {
        window.location.replace("employee.html");
      }, 900);

      return;
    }

    state.profile = profile;

    renderProfile();

    await setupPushNotifications();

    await loadData();

    await initializeMentions();
  } catch (error) {
    console.error("Admin initialization error:", error);

    showToast("Error", getReadableFirebaseError(error), "error");
  } finally {
    setLoading(false);
  }
}

// ============================================================
// PROFILE
// ============================================================

function renderProfile() {
  const name = state.profile?.name || state.authUser?.displayName || "Admin";

  const email = state.profile?.email || state.authUser?.email || "";

  el.userName.textContent = name;

  el.userEmail.textContent = email;

  el.userAvatar.textContent = getInitials(name);
}

// ============================================================
// LOAD DATA
// ============================================================

async function loadData() {
  try {
    setLoading(true);

    const [users, tasks] = await Promise.all([getUsers(), getAllTasks()]);

    state.users = users;

    state.tasks = tasks.map((task) => ({
      ...task,

      calculatedStatus: calculateTaskStatus(task),
    }));

    renderDashboard();
    renderTasks();
    renderUsers();
    populateUserSelects();
  } catch (error) {
    console.error("Load admin data error:", error);

    showToast("Unable to load data", getReadableFirebaseError(error), "error");
  } finally {
    setLoading(false);
  }
}

// ============================================================
// DASHBOARD
// ============================================================

function renderDashboard() {
  const counts = getTaskCounts();

  el.totalTasks.textContent = counts.total;

  el.pendingTasks.textContent = counts.pending;

  el.completedTasks.textContent = counts.completed;

  el.expiredTasks.textContent = counts.expired;

  renderRecentTasks();
  renderTeamOverview();
}

function getTaskCounts() {
  const counts = {
    total: state.tasks.length,
    pending: 0,
    completed: 0,
    expired: 0,
  };

  state.tasks.forEach((task) => {
    if (task.calculatedStatus === "completed") {
      counts.completed++;
    } else if (task.calculatedStatus === "expired") {
      counts.expired++;
    } else {
      counts.pending++;
    }
  });

  return counts;
}

// ============================================================
// RECENT TASKS
// ============================================================

function renderRecentTasks() {
  const tasks = [...state.tasks]
    .sort((a, b) => getDateValue(b.createdAt) - getDateValue(a.createdAt))
    .slice(0, 7);

  if (!tasks.length) {
    el.recentTasks.innerHTML = createEmptyState(
      "No tasks",
      "No tasks have been created yet.",
    );

    return;
  }

  el.recentTasks.innerHTML = tasks.map(createTaskRow).join("");
}

function createTaskRow(task) {
  const assignedUser = getUserById(task.assignedTo);

  return `
    <div class="task-row">

      <div class="task-main">

        <div class="task-title">
          ${escapeHtml(task.title || "Untitled Task")}
        </div>

        <div class="task-meta">

          <span>
            <i class="fa-solid fa-user"></i>
            ${escapeHtml(
              assignedUser?.name || task.assignedToName || "Unassigned",
            )}
          </span>

          <span>
            <i class="fa-regular fa-calendar"></i>
            ${formatDateTime(task.scheduledAt)}
          </span>

        </div>

      </div>

      <div class="task-side">
        ${createStatusBadge(task.calculatedStatus)}
      </div>

    </div>
  `;
}

// ============================================================
// TEAM
// ============================================================

function renderTeamOverview() {
  const users = state.users.filter((user) => user.active !== false).slice(0, 8);

  if (!users.length) {
    el.teamOverview.innerHTML = createEmptyState(
      "No users",
      "No team members found.",
    );

    return;
  }

  el.teamOverview.innerHTML = users
    .map((user) => {
      const taskCount = state.tasks.filter(
        (task) => task.assignedTo === user.id,
      ).length;

      return `
          <div class="team-user">

            <div class="team-avatar">
              ${getInitials(user.name)}
            </div>

            <div class="team-user-info">

              <strong>
                ${escapeHtml(user.name || "Unnamed")}
              </strong>

              <span>
                ${user.role === "admin" ? "Administrator" : "Employee"}
              </span>

            </div>

            <span class="status-badge ${
              user.role === "admin" ? "admin" : "employee"
            }">
              ${taskCount} tasks
            </span>

          </div>
        `;
    })
    .join("");
}

// ============================================================
// TASKS
// ============================================================

function renderTasks() {
  let tasks = [...state.tasks];

  if (state.taskFilter !== "all") {
    tasks = tasks.filter((task) => task.calculatedStatus === state.taskFilter);
  }

  if (state.taskUserFilter !== "all") {
    tasks = tasks.filter((task) => task.assignedTo === state.taskUserFilter);
  }

  tasks.sort((a, b) => getDateValue(b.createdAt) - getDateValue(a.createdAt));

  if (!tasks.length) {
    el.adminTasks.innerHTML = createEmptyState(
      "No tasks found",
      "There are no tasks matching the current filters.",
    );

    return;
  }

  el.adminTasks.innerHTML = tasks.map(createAdminTask).join("");
}

function createAdminTask(task) {
  const assignedUser = getUserById(task.assignedTo);

  return `
    <article class="admin-task">

      <div>

        <div class="admin-task-title">
          ${escapeHtml(task.title || "Untitled Task")}
        </div>

      </div>

      <div class="admin-task-info">
        <span>Assigned To</span>

        ${escapeHtml(assignedUser?.name || task.assignedToName || "Unassigned")}
      </div>

      <div class="admin-task-info">
        <span>Scheduled</span>

        ${formatDateTime(task.scheduledAt)}
      </div>

      <div class="admin-task-info">
        <span>Deadline</span>

        ${formatDateTime(task.deadline)}
      </div>

      <div class="status-column">
        ${createStatusBadge(task.calculatedStatus)}
      </div>

    </article>
  `;
}

// ============================================================
// USERS
// ============================================================

function renderUsers() {
  if (!state.users.length) {
    el.usersTableBody.innerHTML = `
      <tr>
        <td
          colspan="6"
          class="table-loading"
        >
          No users found.
        </td>
      </tr>
    `;

    return;
  }

  el.usersTableBody.innerHTML = state.users.map(createUserRow).join("");
}

function createUserRow(user) {
  const taskCount = state.tasks.filter(
    (task) => task.assignedTo === user.id,
  ).length;

  const visible = user.showTasks !== false && user.receiveTasks !== false;

  const active = user.active !== false;

  return `
    <tr>

      <td>

        <div class="user-table-info">

          <div class="user-table-avatar">
            ${getInitials(user.name)}
          </div>

          <div>

            <strong>
              ${escapeHtml(user.name || "Unnamed")}
            </strong>

            <span>
              ${escapeHtml(user.email || "")}
            </span>

          </div>

        </div>

      </td>

      <td>
        <span class="status-badge ${
          user.role === "admin" ? "admin" : "employee"
        }">
          ${user.role === "admin" ? "Admin" : "Employee"}
        </span>
      </td>

      <td>
        ${taskCount}
      </td>

      <td>

        <span class="visibility ${visible ? "on" : "off"}">

          <i class="fa-solid ${visible ? "fa-eye" : "fa-eye-slash"}"></i>

          ${visible ? "Visible" : "Hidden"}

        </span>

      </td>

      <td>

        <span class="visibility ${active ? "on" : "off"}">

          <i class="fa-solid ${
            active ? "fa-circle-check" : "fa-circle-xmark"
          }"></i>

          ${active ? "Active" : "Disabled"}

        </span>

      </td>

      <td>

        <div class="action-buttons">

          <button
            class="small-button"
            title="Edit"
            data-edit-user="${user.id}"
          >
            <i class="fa-solid fa-pen"></i>
          </button>

        </div>

      </td>

    </tr>
  `;
}

// ============================================================
// SELECTS
// ============================================================

function populateUserSelects() {
  const employees = state.users.filter(
    (user) => user.role === "employee" && user.active !== false,
  );

  el.assignedTo.innerHTML = `
    <option value="">
      Select employee
    </option>

    ${employees
      .map(
        (user) => `
          <option value="${user.id}">
            ${escapeHtml(user.name)}
          </option>
        `,
      )
      .join("")}
  `;

  el.taskUserFilter.innerHTML = `
    <option value="all">
      All Users
    </option>

    ${state.users
      .map(
        (user) => `
          <option value="${user.id}">
            ${escapeHtml(user.name)}
          </option>
        `,
      )
      .join("")}
  `;

  el.taskUserFilter.value = state.taskUserFilter;
}

// ============================================================
// CREATE TASK
// ============================================================

async function handleCreateTask(event) {
  event.preventDefault();

  const title = document.getElementById("taskTitle").value.trim();

  const description = document.getElementById("taskDescription").value.trim();

  const link = document.getElementById("taskLink").value.trim();

  const assignedTo = el.assignedTo.value;

  const scheduledValue = document.getElementById("scheduledAt").value;

  const deadlineValue = document.getElementById("deadline").value;

  if (!title) {
    showToast("Missing title", "Please enter a task title.", "error");

    return;
  }

  if (!assignedTo) {
    showToast("Missing employee", "Please select an employee.", "error");

    return;
  }

  const scheduledAt = new Date(scheduledValue);

  const deadline = new Date(deadlineValue);

  if (Number.isNaN(scheduledAt.getTime()) || Number.isNaN(deadline.getTime())) {
    showToast("Invalid date", "Please enter valid dates.", "error");

    return;
  }

  if (scheduledAt <= new Date()) {
    showToast(
      "Invalid schedule",
      "Scheduled time must be in the future.",
      "error",
    );

    return;
  }

  if (deadline <= scheduledAt) {
    showToast(
      "Invalid deadline",
      "Deadline must be after the scheduled time.",
      "error",
    );

    return;
  }

  const submitButton = el.taskForm.querySelector('button[type="submit"]');

  try {
    submitButton.disabled = true;

    submitButton.innerHTML = `
      <span class="spinner"></span>
      Creating...
    `;

    await createTask({
      title,
      description,
      link,

      createdBy: state.authUser.uid,

      assignedTo,
      scheduledAt,
      deadline,
    });

    closeModal("taskModal");

    el.taskForm.reset();

    showToast("Task created", "The task has been assigned successfully.");

    await loadData();
  } catch (error) {
    console.error("Create task error:", error);

    showToast(
      "Unable to create task",
      getReadableFirebaseError(error),
      "error",
    );
  } finally {
    submitButton.disabled = false;

    submitButton.innerHTML = `
      <i class="fa-solid fa-plus"></i>
      Create Task
    `;
  }
}

// ============================================================
// CREATE USER
// ============================================================

async function handleCreateUser(event) {
  event.preventDefault();

  const name = document.getElementById("userFullName").value.trim();

  const email = document.getElementById("userEmailInput").value.trim();

  const password = document.getElementById("userPassword").value;

  const role = document.getElementById("userRole").value;

  const showTasks = document.getElementById("showTasks").value === "true";

  const submitButton = el.userForm.querySelector('button[type="submit"]');

  try {
    submitButton.disabled = true;

    submitButton.innerHTML = `
      <span class="spinner"></span>
      Creating...
    `;

    await createUser({
      name,
      email,
      password,
      role,
      receiveTasks: showTasks,
      active: true,
    });

    closeModal("userModal");

    el.userForm.reset();

    showToast(
      "User created",
      `${name} can now sign in using the created account.`,
    );

    await loadData();
  } catch (error) {
    console.error("Create user error:", error);

    showToast(
      "Unable to create user",
      getReadableFirebaseError(error),
      "error",
    );
  } finally {
    submitButton.disabled = false;

    submitButton.innerHTML = `
      <i class="fa-solid fa-user-plus"></i>
      Create User
    `;
  }
}

// ============================================================
// EDIT USER
// ============================================================

function openEditUser(userId) {
  const user = getUserById(userId);

  if (!user) {
    return;
  }

  document.getElementById("editUserId").value = user.id;

  document.getElementById("editUserName").textContent =
    `${user.name || "Unnamed"} — ${user.email || ""}`;

  document.getElementById("editUserRole").value = user.role || "employee";

  document.getElementById("editShowTasks").value = String(
    user.showTasks !== false && user.receiveTasks !== false,
  );

  document.getElementById("editUserStatus").value = String(
    user.active !== false,
  );

  openModal("editUserModal");
}

async function handleEditUser(event) {
  event.preventDefault();

  const uid = document.getElementById("editUserId").value;

  const role = document.getElementById("editUserRole").value;

  const showTasks = document.getElementById("editShowTasks").value === "true";

  const active = document.getElementById("editUserStatus").value === "true";

  const submitButton = el.editUserForm.querySelector('button[type="submit"]');

  try {
    submitButton.disabled = true;

    submitButton.innerHTML = `
      <span class="spinner"></span>
      Saving...
    `;

    await updateUser(uid, {
      role,
      showTasks,
      receiveTasks: showTasks,
      active,
    });

    closeModal("editUserModal");

    showToast("User updated", "The user settings were updated successfully.");

    await loadData();
  } catch (error) {
    console.error("Update user error:", error);

    showToast(
      "Unable to update user",
      getReadableFirebaseError(error),
      "error",
    );
  } finally {
    submitButton.disabled = false;

    submitButton.innerHTML = `
      <i class="fa-solid fa-floppy-disk"></i>
      Save Changes
    `;
  }
}

// ============================================================
// MENTIONS
// ============================================================

async function initializeMentions() {
  try {
    await loadMentionSettings();

    await loadMentionAnalytics();

    if (state.mentionUnsubscribe) {
      state.mentionUnsubscribe();
    }

    state.mentionUnsubscribe = watchMentions((mentions) => {
      state.mentions = mentions;

      renderAdminMentions();
      renderMentionAnalytics();
      refreshMentionDetailsIfOpen();
    });
  } catch (error) {
    console.error("Mentions initialization error:", error);

    showToast("Mentions Error", getReadableFirebaseError(error), "error");
  }
}

async function loadMentionSettings() {
  const settings = await getMentionSettings();

  if (el.mentionLockDuration) {
    el.mentionLockDuration.value = String(settings.defaultLockDurationMinutes);
  }
}

async function loadMentionAnalytics() {
  const analytics = await getMentionAnalytics();

  renderMentionAnalyticsData(analytics);
}

function renderMentionAnalytics() {
  loadMentionAnalytics().catch((error) => {
    console.error("Mention analytics error:", error);
  });
}

function renderMentionAnalyticsData(analytics) {
  const stats = analytics?.stats || {};

  if (el.mentionTotal) {
    el.mentionTotal.textContent = stats.totalMentions || 0;
  }

  if (el.mentionActive) {
    el.mentionActive.textContent = stats.activeMentions || 0;
  }

  if (el.mentionOpen) {
    el.mentionOpen.textContent = stats.openMentions || 0;
  }

  if (el.mentionLocked) {
    el.mentionLocked.textContent = stats.lockedMentions || 0;
  }

  if (el.mentionExpired) {
    el.mentionExpired.textContent = stats.expiredMentions || 0;
  }

  if (el.mentionCompleted) {
    el.mentionCompleted.textContent = stats.completedMentions || 0;
  }

  if (!el.mentionPerformanceBody) {
    return;
  }

  const users = analytics?.users || [];

  if (!users.length) {
    el.mentionPerformanceBody.innerHTML = `
      <tr>
        <td colspan="4" class="table-loading">
          No analytics data yet.
        </td>
      </tr>
    `;

    return;
  }

  el.mentionPerformanceBody.innerHTML = users
    .map(
      (user) => `
          <tr>
            <td>
              <strong>
                ${escapeHtml(user.name || "Unnamed")}
              </strong>
            </td>

            <td>
              ${user.createdCount || 0}
            </td>

            <td>
              ${user.completedCount || 0}
            </td>

            <td>
              ${user.pendingCount || 0}
            </td>
          </tr>
        `,
    )
    .join("");
}

function renderAdminMentions() {
  if (!el.adminMentionsList) {
    return;
  }

  if (!state.mentions.length) {
    el.adminMentionsList.innerHTML = createEmptyState(
      "No Mentions yet",
      "Create the first Facebook Mention.",
    );

    return;
  }

  el.adminMentionsList.innerHTML = state.mentions
    .map((mention) => createAdminMentionCard(mention))
    .join("");
}

function createAdminMentionCard(mention) {
  const status = getMentionStatus(mention);

  const queue = Array.isArray(mention.queue) ? mention.queue : [];

  const completed = Array.isArray(mention.completedBy)
    ? mention.completedBy
    : [];

  const locker = mention.currentLocker?.name || "";

  const currentUid = state.authUser?.uid;

  const claimedByMe = mention.currentLocker?.uid === currentUid;

  const completedByMe = completed.some((item) => item.uid === currentUid);

  let action = "";

  if (claimedByMe && !completedByMe) {
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
  }

  if (status === "expired") {
    action += `
      <button
        type="button"
        class="mention-action mention-action-primary"
        data-reactivate-mention="${escapeHtml(mention.id)}"
      >
        <i class="fa-solid fa-rotate"></i>
        Reactivate
      </button>
    `;
  }

  return `
    <article
      class="mention-card"
      data-mention-details="${escapeHtml(mention.id)}"
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

        ${createMentionStatusBadge(status)}

      </div>

      <div class="mention-card-info">

        <span>
          <i class="fa-solid fa-user"></i>
          ${escapeHtml(mention.createdByName || "Unknown")}
        </span>

        <span>
          <i class="fa-solid fa-users"></i>
          ${completed.length}/${mention.totalParticipants || 0}
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
              ? getMentionCountdownText(mention)
              : status === "open"
                ? "Available now"
                : status === "expired"
                  ? "Expired"
                  : "Completed"
          }
        </span>

      </div>

      <div class="mention-card-bottom">

        <span class="mention-card-progress">
          ${queue.length} pending · ${completed.length} completed
        </span>

        <div class="mention-card-actions">

          ${action}

          <button
            type="button"
            class="mention-action mention-action-secondary"
            data-open-mention-details="${escapeHtml(mention.id)}"
          >
            Details
          </button>

        </div>

      </div>

    </article>
  `;
}

function createMentionStatusBadge(status) {
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

function createMentionTimerHtml(mention) {
  const target =
    mention.currentLocker && mention.lockUntil
      ? mention.lockUntil
      : mention.unlockAt;

  return `
    <span
      class="mention-countdown"
      data-countdown-type="mention"
      data-target="${escapeHtml(String(timestampForClient(target)))}"
      data-mention-id="${escapeHtml(mention.id)}"
    >
      ${getMentionCountdownText(mention)}
    </span>
  `;
}

function timestampForClient(value) {
  const date = convertFirebaseDate(value);

  return date ? date.getTime() : 0;
}

function getMentionCountdownText(mention) {
  const status = getMentionStatus(mention);

  const now = Date.now();

  if (status === "open") {
    return "Available now";
  }

  if (status === "expired") {
    return "Expired";
  }

  if (status === "completed") {
    return "Completed";
  }

  const target =
    mention.currentLocker && mention.lockUntil
      ? convertFirebaseDate(mention.lockUntil)
      : convertFirebaseDate(mention.unlockAt);

  if (!target) {
    return "Waiting...";
  }

  const diff = target.getTime() - now;

  if (diff <= 0) {
    return "Updating...";
  }

  return `${
    mention.currentLocker ? "Locked for " : "Opens in "
  }${formatDuration(diff)}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));

  const days = Math.floor(totalSeconds / 86400);

  const hours = Math.floor((totalSeconds % 86400) / 3600);

  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function startMentionCountdown() {
  if (state.mentionCountdownInterval) {
    clearInterval(state.mentionCountdownInterval);
  }

  state.mentionCountdownInterval = setInterval(() => {
    document
      .querySelectorAll("[data-countdown-type='mention']")
      .forEach((element) => {
        const mention = state.mentions.find(
          (item) => item.id === element.dataset.mentionId,
        );

        if (!mention) {
          return;
        }

        element.textContent = getMentionCountdownText(mention);
      });

    renderAdminMentionsIfNeeded();
  }, 1000);
}

let lastMentionRenderSignature = "";

function renderAdminMentionsIfNeeded() {
  if (!state.mentions.length) {
    return;
  }

  const signature = state.mentions
    .map((mention) => {
      const status = getMentionStatus(mention);

      const target =
        status === "locked"
          ? mention.currentLocker && mention.lockUntil
            ? timestampForClient(mention.lockUntil)
            : timestampForClient(mention.unlockAt)
          : status;

      return `${mention.id}:${status}:${target}`;
    })
    .join("|");

  if (signature === lastMentionRenderSignature) {
    return;
  }

  lastMentionRenderSignature = signature;

  renderAdminMentions();
}

function refreshMentionDetailsIfOpen() {
  const modal = el.mentionDetailsModal;

  if (!modal || !modal.classList.contains("active")) {
    return;
  }

  const mentionId = modal.dataset.mentionId;

  if (mentionId) {
    openMentionDetails(mentionId, false);
  }
}

function openMentionDetails(mentionId, openModalAfter = true) {
  const mention = state.mentions.find((item) => item.id === mentionId);

  if (!mention) {
    return;
  }

  const status = getMentionStatus(mention);

  if (el.mentionDetailsModal) {
    el.mentionDetailsModal.dataset.mentionId = mentionId;
  }

  if (el.mentionDetailsTitle) {
    el.mentionDetailsTitle.textContent = "Mention Details";
  }

  if (!el.mentionDetailsContent) {
    return;
  }

  const queue = Array.isArray(mention.queue) ? mention.queue : [];

  const completed = Array.isArray(mention.completedBy)
    ? mention.completedBy
    : [];

  const history = Array.isArray(mention.history)
    ? [...mention.history].reverse()
    : [];

  el.mentionDetailsContent.innerHTML = `
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
          <span>Status</span>
          ${createMentionStatusBadge(status)}
        </div>

        <div>
          <span>Expires</span>
          <strong>
            ${formatDateTime(mention.expiresAt)}
          </strong>
        </div>

        <div>
          <span>Lock duration</span>
          <strong>
            ${formatDuration(mention.lockDurationMinutes * 60 * 1000)}
          </strong>
        </div>

        <div>
          <span>Cycles</span>
          <strong>
            ${mention.cycles || 0}
          </strong>
        </div>
      </div>

      <div class="mention-detail-section">
        <h3>Participants</h3>

        <div class="participant-list">
          <div class="participant-item completed">
            <span>
              <i class="fa-solid fa-user-check"></i>
              ${escapeHtml(mention.createdByName || "Creator")}
            </span>

            <strong>Creator</strong>
          </div>

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

          ${
            !queue.length && !completed.length
              ? `
                <div class="empty-state">
                  No participants.
                </div>
              `
              : ""
          }
        </div>
      </div>

      <div class="mention-detail-section">
        <div class="mention-history-header">
          <h3>Activity</h3>

          ${
            status === "expired"
              ? `
                <div class="reactivation-actions">
                  <button
                    class="secondary-button small"
                    data-reactivate-mention="${escapeHtml(mention.id)}"
                    data-extra-time="120"
                  >
                    +2h
                  </button>

                  <button
                    class="secondary-button small"
                    data-reactivate-mention="${escapeHtml(mention.id)}"
                    data-extra-time="240"
                  >
                    +4h
                  </button>

                  <button
                    class="secondary-button small"
                    data-reactivate-mention="${escapeHtml(mention.id)}"
                    data-extra-time="360"
                  >
                    +6h
                  </button>

                  <button
                    class="secondary-button small"
                    data-reactivate-mention="${escapeHtml(mention.id)}"
                    data-extra-time="720"
                  >
                    +12h
                  </button>

                  <button
                    class="primary-button small"
                    data-reactivate-mention="${escapeHtml(mention.id)}"
                    data-extra-time="1440"
                  >
                    +24h
                  </button>
                </div>
              `
              : ""
          }
        </div>

        <div class="mention-history">
          ${
            history.length
              ? history
                  .map(
                    (event) => `
                      <div class="history-item">
                        <div class="history-dot"></div>

                        <div>
                          <strong>
                            ${escapeHtml(mentionHistoryLabel(event))}
                          </strong>

                          <span>
                            ${formatDateTime(event.timestamp)}
                          </span>
                        </div>
                      </div>
                    `,
                  )
                  .join("")
              : `
                <div class="empty-state">
                  No activity yet.
                </div>
              `
          }
        </div>
      </div>
    </div>
  `;

  if (openModalAfter) {
    openModal("mentionDetailsModal");
  }
}

function mentionHistoryLabel(event) {
  const name = event.userName || "System";

  const labels = {
    created: `${name} created the Mention`,
    claimed: `${name} started execution`,
    completed: `${name} completed the Mention`,
    reactivated: `${name} reactivated the Mention`,
    cycle_locked: `Mention locked for the next cycle`,
  };

  return labels[event.type] || `${name} performed ${event.type}`;
}

async function handleCreateMention(event) {
  event.preventDefault();

  const submitButton = el.mentionForm?.querySelector('button[type="submit"]');

  const url = document.getElementById("mentionUrl")?.value || "";

  const description =
    document.getElementById("mentionDescription")?.value || "";

  try {
    if (submitButton) {
      submitButton.disabled = true;
    }

    await createMention({
      url,
      description,
    });

    el.mentionForm.reset();

    closeModal("mentionModal");

    showToast("Mention created", "The Mention was created successfully.");

    await loadMentionAnalytics();
  } catch (error) {
    console.error("Create mention error:", error);

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

async function handleMentionSettings(event) {
  event.preventDefault();

  const value = Number(el.mentionLockDuration?.value);

  try {
    await updateMentionSettings(value);

    showToast(
      "Settings saved",
      "New Mentions will use the updated lock duration.",
    );
  } catch (error) {
    console.error("Mention settings error:", error);

    showToast(
      "Unable to save settings",
      getReadableFirebaseError(error),
      "error",
    );
  }
}

async function handleCompleteMention(mentionId) {
  try {
    await completeMention(mentionId);

    showToast("Mention completed", "Your participation has been recorded.");

    await loadMentionAnalytics();
  } catch (error) {
    console.error("Complete Mention error:", error);

    showToast(
      "Unable to complete Mention",
      getReadableFirebaseError(error),
      "error",
    );
  }
}

async function handleReactivateMention(mentionId, minutes) {
  const labels = {
    120: "2 hours",
    240: "4 hours",
    360: "6 hours",
    720: "12 hours",
    1440: "24 hours",
  };

  const label = labels[minutes] || `${minutes} minutes`;

  const confirmed = window.confirm(`Reactivate this Mention for ${label}?`);

  if (!confirmed) {
    return;
  }

  try {
    await reactivateMention(mentionId, minutes);

    showToast(
      "Mention reactivated",
      `The Mention is available again for ${label}.`,
    );

    await loadMentionAnalytics();

    closeModal("mentionDetailsModal");
  } catch (error) {
    console.error("Reactivate mention error:", error);

    showToast(
      "Unable to reactivate Mention",
      getReadableFirebaseError(error),
      "error",
    );
  }
}

// async function handleCompleteMention(mentionId) {
//   try {
//     await completeMention(mentionId);

//     showToast("Mention completed", "Your participation has been recorded.");

//     await loadMentionAnalytics();
//   } catch (error) {
//     console.error("Complete Mention error:", error);

//     showToast(
//       "Unable to complete Mention",
//       getReadableFirebaseError(error),
//       "error",
//     );
//   }
// }

// ============================================================
// NAVIGATION
// ============================================================

function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      showSection(item.dataset.section);
    });
  });

  document.querySelectorAll("[data-section-link]").forEach((button) => {
    button.addEventListener("click", () => {
      showSection(button.dataset.sectionLink);
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
// FILTERS
// ============================================================

function setupFilters() {
  document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      document
        .querySelectorAll(".filter-button")
        .forEach((item) => item.classList.remove("active"));

      button.classList.add("active");

      state.taskFilter = button.dataset.filter;

      renderTasks();
    });
  });

  el.taskUserFilter.addEventListener("change", () => {
    state.taskUserFilter = el.taskUserFilter.value;

    renderTasks();
  });
}

// ============================================================
// ACTIONS
// ============================================================

function setupActions() {
  el.addTaskButton?.addEventListener("click", () => openModal("taskModal"));

  el.dashboardAddTaskButton?.addEventListener("click", () =>
    openModal("taskModal"),
  );

  el.addUserButton?.addEventListener("click", () => openModal("userModal"));

  el.refreshButton?.addEventListener("click", loadData);

  el.logoutButton?.addEventListener("click", async () => {
    try {
      await logoutUser();

      window.location.replace("login.html");
    } catch (error) {
      console.error("Logout error:", error);
    }
  });

  el.taskForm?.addEventListener("submit", handleCreateTask);

  el.userForm?.addEventListener("submit", handleCreateUser);

  el.mentionForm?.addEventListener("submit", handleCreateMention);

  el.mentionSettingsForm?.addEventListener("submit", handleMentionSettings);

  el.addMentionButton?.addEventListener("click", () =>
    openModal("mentionModal"),
  );

  el.editUserForm?.addEventListener("submit", handleEditUser);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-user]");

    if (button) {
      openEditUser(button.dataset.editUser);
    }
  });

  document.addEventListener("click", (event) => {
    const completeButton = event.target.closest("[data-complete-mention]");

    if (completeButton) {
      handleCompleteMention(completeButton.dataset.completeMention);

      return;
    }

    document.addEventListener("click", (event) => {
      const completeButton = event.target.closest("[data-complete-mention]");

      if (completeButton) {
        handleCompleteMention(completeButton.dataset.completeMention);

        return;
      }

      const detailsButton = event.target.closest("[data-open-mention-details]");

      if (detailsButton) {
        openMentionDetails(detailsButton.dataset.openMentionDetails);

        return;
      }

      const reactivateButton = event.target.closest(
        "[data-reactivate-mention]",
      );
    });
  });
}

// ============================================================
// MODALS
// ============================================================

function setupModals() {
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal(button.dataset.closeModal);
    });
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    document
      .querySelectorAll(".modal-overlay.active")
      .forEach((modal) => closeModal(modal.id));
  });

  el.closeToast?.addEventListener("click", hideToast);
}

function openModal(id) {
  document.getElementById(id)?.classList.add("active");

  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("active");

  if (!document.querySelector(".modal-overlay.active")) {
    document.body.style.overflow = "";
  }
}

// ============================================================
// TOAST
// ============================================================

let toastTimer = null;

function showToast(title, message, type = "success") {
  if (!el.toast) {
    return;
  }

  el.toastTitle.textContent = title;

  el.toastMessage.textContent = message;

  const icon = el.toast.querySelector(".toast-icon i");

  if (type === "error") {
    icon.className = "fa-solid fa-circle-exclamation";

    el.toast.classList.add("error");
  } else {
    icon.className = "fa-solid fa-check";

    el.toast.classList.remove("error");
  }

  el.toast.classList.add("active");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(hideToast, 4500);
}

function hideToast() {
  el.toast?.classList.remove("active");
}

// ============================================================
// HELPERS
// ============================================================

function getUserById(userId) {
  return state.users.find((user) => user.id === userId || user.uid === userId);
}

function createStatusBadge(status) {
  const labels = {
    pending: "Pending",
    completed: "Completed",
    expired: "Expired",
  };

  return `
    <span class="status-badge ${status}">
      ${labels[status] || "Unknown"}
    </span>
  `;
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

function getDateValue(value) {
  const date = convertFirebaseDate(value);

  return date ? date.getTime() : 0;
}

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

function setLoading(isLoading) {
  state.loading = isLoading;
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

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", closeSidebar);
  });

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
// async function setupPushNotifications() {
//   if (!("serviceWorker" in navigator)) {
//     console.log("FCM: Service Worker is not supported.");
//     return;
//   }

//   try {
//     console.log("FCM: Registering service worker...");

//     const registration = await navigator.serviceWorker.register(
//       "./firebase-messaging-sw.js",
//     );

//     console.log("FCM: Service worker registered:", registration);

//     console.log(
//       "FCM: Current notification permission:",
//       Notification.permission,
//     );

//     const token = await registerPushNotifications();

//     console.log("FCM: Registration result:", token);

//     await listenForForegroundNotifications((payload) => {
//       console.log("FCM: Foreground notification:", payload);

//       showNotificationToast(payload);
//     });

//     console.log("FCM: Foreground listener ready.");
//   } catch (error) {
//     console.error("FCM: Push notification setup failed:", error);
//   }
// }
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
