// ============================================================
// employee.js
// Employee UI / Page Logic
// ------------------------------------------------------------
// IMPORTANT:
// This file does NOT communicate with Firebase directly.
// All Firebase operations go through firebase.js.
// ============================================================
import {
  getCurrentAuthUser,
  listenToAuthState,
  logoutUser,
  getUser,
  getTasksForUser,
  getTask,
  completeTask,
  calculateTaskStatus,
  convertFirebaseDate,
} from "./firebase.js";
// ============================================================
// STATE
// ============================================================

const state = {
  authUser: null,

  profile: null,

  tasks: [],

  currentFilter: "all",

  selectedTask: null,

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

  totalTasks: document.getElementById("totalTasks"),

  pendingTasks: document.getElementById("pendingTasks"),

  completedTasks: document.getElementById("completedTasks"),

  expiredTasks: document.getElementById("expiredTasks"),

  upcomingTasks: document.getElementById("upcomingTasks"),

  allTasks: document.getElementById("allTasks"),

  dashboardSection: document.getElementById("dashboardSection"),

  tasksSection: document.getElementById("tasksSection"),

  viewAllTasksButton: document.getElementById("viewAllTasksButton"),

  refreshButton: document.getElementById("refreshButton"),

  logoutButton: document.getElementById("logoutButton"),

  taskModal: document.getElementById("taskModal"),

  closeModalButton: document.getElementById("closeModalButton"),

  cancelModalButton: document.getElementById("cancelModalButton"),

  modalTaskTitle: document.getElementById("modalTaskTitle"),

  modalTaskStatus: document.getElementById("modalTaskStatus"),

  modalScheduled: document.getElementById("modalScheduled"),

  modalDeadline: document.getElementById("modalDeadline"),

  modalDescription: document.getElementById("modalDescription"),

  modalDescriptionContainer: document.getElementById(
    "modalDescriptionContainer",
  ),

  modalTaskLink: document.getElementById("modalTaskLink"),

  modalLinkContainer: document.getElementById("modalLinkContainer"),

  deadlineWarning: document.getElementById("deadlineWarning"),

  completeTaskButton: document.getElementById("completeTaskButton"),

  toast: document.getElementById("toast"),

  toastTitle: document.getElementById("toastTitle"),

  toastMessage: document.getElementById("toastMessage"),

  closeToast: document.getElementById("closeToast"),
};

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  setupNavigation();

  setupFilters();

  setupModal();

  setupActions();
  createEmployeeLoginScreen();
  listenToAuthentication();
}

// ============================================================
// AUTH
// ============================================================
function createEmployeeLoginScreen() {
  if (document.getElementById("employeeLoginGate")) {
    return;
  }

  const gate = document.createElement("div");

  gate.id = "employeeLoginGate";

  gate.innerHTML = `
    <div style="
      position:fixed;
      inset:0;
      z-index:99999;
      background:#0b0d10;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
      font-family:Arial,sans-serif;
    ">

      <div style="
        width:100%;
        max-width:420px;
        background:#15181d;
        border:1px solid rgba(255,255,255,.08);
        border-radius:20px;
        padding:32px;
        box-shadow:0 25px 80px rgba(0,0,0,.45);
      ">

        <div style="
          text-align:center;
          margin-bottom:28px;
        ">

          <div style="
            width:54px;
            height:54px;
            margin:0 auto 16px;
            border-radius:16px;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#fff;
            color:#111;
            font-size:22px;
            font-weight:700;
          ">
            A
          </div>

          <h1 style="
            margin:0 0 8px;
            color:#fff;
            font-size:25px;
          ">
            Employee Login
          </h1>

          <p style="
            margin:0;
            color:#8e959f;
            font-size:14px;
          ">
            Sign in to Tasks Center
          </p>

        </div>


        <form id="employeeLoginForm">

          <div style="margin-bottom:16px">

            <label style="
              display:block;
              color:#c8cdd4;
              font-size:13px;
              margin-bottom:8px;
            ">
              Email
            </label>

            <input
              id="employeeLoginEmail"
              type="email"
              autocomplete="username"
              required
              placeholder="employee@example.com"
              style="
                width:100%;
                box-sizing:border-box;
                padding:13px 14px;
                border-radius:10px;
                border:1px solid #2b3038;
                background:#0f1115;
                color:#fff;
                outline:none;
              "
            />

          </div>


          <div style="margin-bottom:20px">

            <label style="
              display:block;
              color:#c8cdd4;
              font-size:13px;
              margin-bottom:8px;
            ">
              Password
            </label>

            <input
              id="employeeLoginPassword"
              type="password"
              autocomplete="current-password"
              required
              placeholder="••••••••"
              style="
                width:100%;
                box-sizing:border-box;
                padding:13px 14px;
                border-radius:10px;
                border:1px solid #2b3038;
                background:#0f1115;
                color:#fff;
                outline:none;
              "
            />

          </div>


          <div
            id="employeeLoginError"
            style="
              display:none;
              margin-bottom:16px;
              padding:12px;
              border-radius:10px;
              background:rgba(239,68,68,.1);
              color:#f87171;
              font-size:13px;
            "
          ></div>


          <button
            type="submit"
            id="employeeLoginButton"
            style="
              width:100%;
              border:0;
              border-radius:10px;
              padding:13px;
              background:#fff;
              color:#111;
              font-size:14px;
              font-weight:700;
              cursor:pointer;
            "
          >
            Sign In
          </button>

        </form>

      </div>

    </div>
  `;

  document.body.appendChild(gate);

  document
    .getElementById("employeeLoginForm")
    .addEventListener("submit", handleEmployeeLogin);
}

async function handleEmployeeLogin(event) {
  event.preventDefault();

  const email = document.getElementById("employeeLoginEmail").value.trim();

  const password = document.getElementById("employeeLoginPassword").value;

  const button = document.getElementById("employeeLoginButton");

  const error = document.getElementById("employeeLoginError");

  error.style.display = "none";

  button.disabled = true;

  button.textContent = "Signing in...";

  try {
    const { login } = await import("./firebase.js");

    await login(email, password);
  } catch (err) {
    console.error("Employee login error:", err);

    error.textContent = getReadableError(err);

    error.style.display = "block";

    button.disabled = false;

    button.textContent = "Sign In";
  }
}

function hideEmployeeLoginScreen() {
  const gate = document.getElementById("employeeLoginGate");

  if (gate) {
    gate.remove();
  }
}
function listenToAuthentication() {
  createEmployeeLoginScreen();

  listenToAuthState(async (user) => {
    if (!user) {
      state.authUser = null;

      state.profile = null;

      createEmployeeLoginScreen();

      return;
    }

    state.authUser = user;

    await initializeEmployee(user.uid);
  });
}

async function initializeEmployee(userId) {
  try {
    setLoading(true);

    // -----------------------------------------------
    // Get employee profile
    // -----------------------------------------------

    const profile = await getUser(userId);

    if (!profile) {
      showToast(
        "Account Error",
        "Your user profile could not be found.",
        "error",
      );

      return;
    }

    state.profile = profile;
    if (profile.active === false) {
      showToast("Account Disabled", "Your account has been disabled.", "error");

      await logoutUser();

      return;
    }

    if (profile.role !== "employee") {
      showToast(
        "Access denied",
        "This account is not an employee account.",
        "error",
      );

      await logoutUser();

      return;
    }

    hideEmployeeLoginScreen();

    // -----------------------------------------------
    // Update UI
    // -----------------------------------------------

    renderUserProfile();

    // -----------------------------------------------
    // Load tasks
    // -----------------------------------------------

    await loadTasks();
  } catch (error) {
    console.error("Employee initialization error:", error);

    showToast("Error", getReadableError(error), "error");
  } finally {
    setLoading(false);
  }
}

// ============================================================
// PROFILE
// ============================================================

function renderUserProfile() {
  if (!state.profile) {
    return;
  }

  const name = state.profile.name || state.authUser?.displayName || "Employee";

  const email = state.profile.email || state.authUser?.email || "";

  elements.userName.textContent = name;

  elements.userEmail.textContent = email;

  elements.welcomeName.textContent = getFirstName(name);

  elements.userAvatar.textContent = getInitials(name);
}

// ============================================================
// TASKS
// ============================================================

async function loadTasks() {
  if (!state.authUser) {
    return;
  }

  try {
    setLoading(true);

    const tasks = await getTasksForUser(state.authUser.uid);

    state.tasks = normalizeTasks(tasks);

    renderDashboard();

    renderTasks();
  } catch (error) {
    console.error("Load tasks error:", error);

    renderTasksError();

    showToast("Unable to load tasks", getReadableError(error), "error");
  } finally {
    setLoading(false);
  }
}

function normalizeTasks(tasks) {
  return tasks.map((task) => {
    const status = calculateTaskStatus(task);

    return {
      ...task,
      calculatedStatus: status,
    };
  });
}

// ============================================================
// DASHBOARD
// ============================================================

function renderDashboard() {
  const counts = getTaskCounts();

  elements.totalTasks.textContent = counts.total;

  elements.pendingTasks.textContent = counts.pending;

  elements.completedTasks.textContent = counts.completed;

  elements.expiredTasks.textContent = counts.expired;

  renderUpcomingTasks();
}

function getTaskCounts() {
  const counts = {
    total: state.tasks.length,

    pending: 0,

    completed: 0,

    expired: 0,
  };

  state.tasks.forEach((task) => {
    switch (task.calculatedStatus) {
      case "pending":
        counts.pending++;
        break;

      case "completed":
        counts.completed++;
        break;

      case "expired":
        counts.expired++;
        break;
    }
  });

  return counts;
}

// ============================================================
// UPCOMING
// ============================================================

function renderUpcomingTasks() {
  if (!state.tasks.length) {
    elements.upcomingTasks.innerHTML = createEmptyState(
      "No tasks yet",
      "You don't have any assigned tasks.",
    );

    return;
  }

  const upcoming = [...state.tasks]

    .filter((task) => task.calculatedStatus === "pending")

    .sort((a, b) => getDateValue(a.scheduledAt) - getDateValue(b.scheduledAt))

    .slice(0, 5);

  if (!upcoming.length) {
    elements.upcomingTasks.innerHTML = createEmptyState(
      "No pending tasks",
      "You have no upcoming tasks.",
    );

    return;
  }

  elements.upcomingTasks.innerHTML = upcoming
    .map((task) => createTaskRow(task))
    .join("");
}

// ============================================================
// ALL TASKS
// ============================================================

function renderTasks() {
  const filtered = getFilteredTasks();

  if (!filtered.length) {
    elements.allTasks.innerHTML = createEmptyState(
      "No tasks found",
      "There are no tasks matching this filter.",
    );

    return;
  }

  elements.allTasks.innerHTML = filtered
    .map((task) => createTaskCard(task))
    .join("");
}

// ============================================================
// FILTERING
// ============================================================

function getFilteredTasks() {
  if (state.currentFilter === "all") {
    return [...state.tasks];
  }

  return state.tasks.filter(
    (task) => task.calculatedStatus === state.currentFilter,
  );
}

// ============================================================
// TASK ROW
// ============================================================

function createTaskRow(task) {
  const status = task.calculatedStatus;

  const scheduled = formatDateTime(task.scheduledAt);

  const deadline = formatDateTime(task.deadline);

  return `

        <div class="task-row">

            <div class="task-main">

                <div class="task-title">
                    ${escapeHtml(task.title || "Untitled Task")}
                </div>

                <div class="task-meta">

                    <span>
                        <i class="fa-regular fa-calendar"></i>
                        ${scheduled}
                    </span>

                    <span>
                        <i class="fa-regular fa-clock"></i>
                        Deadline: ${deadline}
                    </span>

                </div>

            </div>


            <div class="task-side">

                ${createStatusBadge(status)}

                <button
                    class="open-task-button"
                    data-task-id="${task.id}"
                >
                    Open
                    <i class="fa-solid fa-arrow-right"></i>
                </button>

            </div>

        </div>

    `;
}

// ============================================================
// TASK CARD
// ============================================================

function createTaskCard(task) {
  const status = task.calculatedStatus;

  const scheduled = formatDateTime(task.scheduledAt);

  const deadline = formatDateTime(task.deadline);

  const description = task.description || "No description provided.";

  return `

        <article
            class="task-card ${status}"
        >

            <div class="task-card-header">

                <h3 class="task-card-title">

                    ${escapeHtml(task.title || "Untitled Task")}

                </h3>

                ${createStatusBadge(status)}

            </div>


            <p class="task-card-description">

                ${escapeHtml(description)}

            </p>


            <div class="task-card-info">


                <div class="info-box">

                    <span>
                        Scheduled
                    </span>

                    <strong>
                        ${scheduled}
                    </strong>

                </div>


                <div class="info-box">

                    <span>
                        Deadline
                    </span>

                    <strong>
                        ${deadline}
                    </strong>

                </div>


            </div>


            <div class="task-card-footer">

                <span class="deadline-text">

                    <i class="fa-regular fa-clock"></i>

                    ${getDeadlineLabel(task)}

                </span>


                <button
                    class="open-task-button"
                    data-task-id="${task.id}"
                >

                    ${status === "expired" ? "View" : "Open"}

                    <i class="fa-solid fa-arrow-right"></i>

                </button>

            </div>

        </article>

    `;
}

// ============================================================
// STATUS BADGE
// ============================================================

function createStatusBadge(status) {
  const labels = {
    pending: "Pending",

    completed: "Completed",

    expired: "Expired",
  };

  return `

        <span
            class="status-badge ${status}"
        >

            ${labels[status] || "Unknown"}

        </span>

    `;
}

// ============================================================
// OPEN TASK
// ============================================================

async function openTask(taskId) {
  try {
    const localTask = state.tasks.find((task) => task.id === taskId);

    if (!localTask) {
      throw new Error("Task not found.");
    }

    // Re-fetch task from Firebase
    // so the employee sees the latest state.

    const freshTask = await getTask(taskId);

    if (!freshTask) {
      throw new Error("This task no longer exists.");
    }

    const normalized = {
      ...freshTask,
      calculatedStatus: calculateTaskStatus(freshTask),
    };

    state.selectedTask = normalized;

    renderTaskModal(normalized);

    openModal();
  } catch (error) {
    console.error("Open task error:", error);

    showToast("Error", getReadableError(error), "error");
  }
}

// ============================================================
// MODAL
// ============================================================

function renderTaskModal(task) {
  const status = task.calculatedStatus;

  elements.modalTaskTitle.textContent = task.title || "Untitled Task";

  elements.modalTaskStatus.textContent = capitalize(status);

  elements.modalTaskStatus.className = `status-badge ${status}`;

  elements.modalScheduled.textContent = formatDateTime(task.scheduledAt);

  elements.modalDeadline.textContent = formatDateTime(task.deadline);

  if (task.description) {
    elements.modalDescription.textContent = task.description;

    elements.modalDescriptionContainer.style.display = "block";
  } else {
    elements.modalDescriptionContainer.style.display = "none";
  }

  if (task.link) {
    elements.modalTaskLink.href = task.link;

    elements.modalLinkContainer.style.display = "block";
  } else {
    elements.modalLinkContainer.style.display = "none";
  }

  const expired = status === "expired";

  const completed = status === "completed";

  elements.deadlineWarning.classList.toggle("active", expired);

  elements.completeTaskButton.disabled = expired || completed;

  if (completed) {
    elements.completeTaskButton.innerHTML = `
                <i class="fa-solid fa-check"></i>
                Completed
            `;
  } else if (expired) {
    elements.completeTaskButton.innerHTML = `
                <i class="fa-solid fa-lock"></i>
                Deadline Passed
            `;
  } else {
    elements.completeTaskButton.innerHTML = `
                <i class="fa-solid fa-check"></i>
                Mark as Completed
            `;
  }
}

function openModal() {
  elements.taskModal.classList.add("active");

  document.body.style.overflow = "hidden";
}

function closeModal() {
  elements.taskModal.classList.remove("active");

  document.body.style.overflow = "";

  state.selectedTask = null;
}

// ============================================================
// COMPLETE TASK
// ============================================================

async function handleCompleteTask() {
  const task = state.selectedTask;

  if (!task) {
    return;
  }

  if (task.calculatedStatus !== "pending") {
    return;
  }

  const confirmed = window.confirm(
    "Are you sure you want to mark this task as completed?",
  );

  if (!confirmed) {
    return;
  }

  try {
    elements.completeTaskButton.disabled = true;

    elements.completeTaskButton.innerHTML = `
                <span class="spinner"></span>
                Completing...
            `;

    await completeTask(task.id);

    showToast(
      "Task completed",
      "The task has been marked as completed.",
      "success",
    );

    closeModal();

    await loadTasks();
  } catch (error) {
    console.error("Complete task error:", error);

    showToast("Unable to complete task", getReadableError(error), "error");

    if (state.selectedTask) {
      renderTaskModal(state.selectedTask);
    }
  }
}

// ============================================================
// NAVIGATION
// ============================================================

function setupNavigation() {
  const navItems = document.querySelectorAll(".nav-item");

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const section = item.dataset.section;

      navItems.forEach((nav) => nav.classList.remove("active"));

      item.classList.add("active");

      showSection(section);
    });
  });
}

function showSection(section) {
  if (section === "dashboard") {
    elements.dashboardSection.classList.add("active");

    elements.tasksSection.classList.remove("active");

    return;
  }

  if (section === "tasks") {
    elements.dashboardSection.classList.remove("active");

    elements.tasksSection.classList.add("active");
  }
}

// ============================================================
// FILTERS
// ============================================================

function setupFilters() {
  const buttons = document.querySelectorAll(".filter-button");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => item.classList.remove("active"));

      button.classList.add("active");

      state.currentFilter = button.dataset.filter;

      renderTasks();
    });
  });
}

// ============================================================
// ACTIONS
// ============================================================

function setupActions() {
  // -----------------------------------------------
  // Open Task
  // -----------------------------------------------

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-task-id]");

    if (!button) {
      return;
    }

    const taskId = button.dataset.taskId;

    if (taskId) {
      openTask(taskId);
    }
  });

  // -----------------------------------------------
  // View All
  // -----------------------------------------------

  elements.viewAllTasksButton.addEventListener("click", () => {
    showSection("tasks");

    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.section === "tasks");
    });
  });

  // -----------------------------------------------
  // Refresh
  // -----------------------------------------------

  elements.refreshButton.addEventListener("click", async () => {
    await loadTasks();
  });

  // -----------------------------------------------
  // Logout
  // -----------------------------------------------

  elements.logoutButton.addEventListener("click", async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error("Logout error:", error);
    }
  });

  // -----------------------------------------------
  // Complete
  // -----------------------------------------------

  elements.completeTaskButton.addEventListener("click", handleCompleteTask);
}

// ============================================================
// MODAL EVENTS
// ============================================================

function setupModal() {
  elements.closeModalButton.addEventListener("click", closeModal);

  elements.cancelModalButton.addEventListener("click", closeModal);

  elements.taskModal.addEventListener("click", (event) => {
    if (event.target === elements.taskModal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

// ============================================================
// LOGOUT / AUTH REDIRECTION
// ============================================================

function handleUnauthenticatedUser() {
  /*
        Later we can redirect to:

        login.html

        For now we simply show a message.
    */

  console.warn("No authenticated user.");

  window.location.href = "login.html";
}

// ============================================================
// LOADING
// ============================================================

function setLoading(isLoading) {
  state.loading = isLoading;

  if (isLoading && state.tasks.length === 0) {
    elements.upcomingTasks.innerHTML = `
                <div class="loading-state">

                    <div class="spinner"></div>

                    <span>
                        Loading tasks...
                    </span>

                </div>
            `;

    elements.allTasks.innerHTML = `
                <div class="loading-state">

                    <div class="spinner"></div>

                    <span>
                        Loading tasks...
                    </span>

                </div>
            `;
  }
}

// ============================================================
// ERROR UI
// ============================================================

function renderTasksError() {
  const html = `

        <div class="empty-state">

            <div class="empty-state-icon">

                <i class="fa-solid fa-circle-exclamation"></i>

            </div>

            <strong>
                Unable to load tasks
            </strong>

            <p>
                Please refresh the page and try again.
            </p>

        </div>

    `;

  elements.upcomingTasks.innerHTML = html;

  elements.allTasks.innerHTML = html;
}

// ============================================================
// EMPTY STATE
// ============================================================

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

// ============================================================
// TOAST
// ============================================================

let toastTimer = null;

function showToast(title, message, type = "success") {
  elements.toastTitle.textContent = title;

  elements.toastMessage.textContent = message;

  const icon = elements.toast.querySelector(".toast-icon i");

  if (type === "error") {
    icon.className = "fa-solid fa-circle-exclamation";

    elements.toast.querySelector(".toast-icon").style.background =
      "var(--danger-bg)";

    elements.toast.querySelector(".toast-icon").style.color = "var(--danger)";
  } else {
    icon.className = "fa-solid fa-check";

    elements.toast.querySelector(".toast-icon").style.background =
      "var(--success-bg)";

    elements.toast.querySelector(".toast-icon").style.color = "var(--success)";
  }

  elements.toast.classList.add("active");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(hideToast, 4000);
}

function hideToast() {
  elements.toast.classList.remove("active");
}

elements.closeToast.addEventListener("click", hideToast);

// ============================================================
// DATE HELPERS
// ============================================================

function getDateValue(value) {
  const date = convertFirebaseDate(value);

  if (!date) {
    return Infinity;
  }

  return date.getTime();
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

function getDeadlineLabel(task) {
  if (task.calculatedStatus === "completed") {
    return "Completed";
  }

  if (task.calculatedStatus === "expired") {
    return "Deadline passed";
  }

  const deadline = convertFirebaseDate(task.deadline);

  if (!deadline) {
    return "No deadline";
  }

  const now = new Date();

  const difference = deadline.getTime() - now.getTime();

  if (difference <= 0) {
    return "Deadline passed";
  }

  const minutes = Math.floor(difference / (1000 * 60));

  if (minutes < 60) {
    return `${minutes} min left`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h left`;
  }

  const days = Math.floor(hours / 24);

  return `${days}d left`;
}

// ============================================================
// TEXT HELPERS
// ============================================================

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
    return parts[0].substring(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function capitalize(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ============================================================
// ERROR MESSAGES
// ============================================================

function getReadableError(error) {
  if (!error) {
    return "Something went wrong.";
  }

  const code = error.code || "";

  const messages = {
    "permission-denied": "You don't have permission to perform this action.",

    "auth/user-not-found": "User account was not found.",

    "auth/network-request-failed":
      "Network error. Please check your connection.",

    "failed-precondition":
      "This request requires a Firestore index. Check the Firebase console.",
  };

  if (messages[code]) {
    return messages[code];
  }

  return error.message || "Something went wrong.";
}

// ============================================================
// AUTO REFRESH STATUS
// ============================================================
//
// Recalculate expired tasks every 30 seconds.
// This does NOT send requests to Firebase.
// It only updates the UI based on existing data.
// ============================================================

setInterval(() => {
  if (!state.tasks.length) {
    return;
  }

  state.tasks = normalizeTasks(state.tasks);

  renderDashboard();

  renderTasks();

  if (state.selectedTask) {
    state.selectedTask = {
      ...state.selectedTask,
      calculatedStatus: calculateTaskStatus(state.selectedTask),
    };
  }
}, 30000);
