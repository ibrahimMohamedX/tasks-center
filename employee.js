// ============================================================
// TaskFlow Employee
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
  getReadableFirebaseError,
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
// INIT
// ============================================================

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  setupNavigation();
  setupFilters();
  setupActions();
  setupModal();

  listenToAuthentication();

  setInterval(refreshStatuses, 30000);
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

    state.profile = profile;

    renderUserProfile();

    await loadTasks();
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
// LOAD TASKS
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

    showToast("Unable to load tasks", getReadableFirebaseError(error), "error");
  } finally {
    setLoading(false);
  }
}

function normalizeTasks(tasks) {
  return tasks.map((task) => ({
    ...task,

    calculatedStatus: calculateTaskStatus(task),
  }));
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
      case "completed":
        counts.completed++;
        break;

      case "expired":
        counts.expired++;
        break;

      default:
        counts.pending++;
    }
  });

  return counts;
}

// ============================================================
// UPCOMING
// ============================================================

function renderUpcomingTasks() {
  const tasks = state.tasks
    .filter((task) => task.calculatedStatus === "pending")
    .sort((a, b) => getDateValue(a.scheduledAt) - getDateValue(b.scheduledAt))
    .slice(0, 5);

  if (!tasks.length) {
    elements.upcomingTasks.innerHTML = createEmptyState(
      "No upcoming tasks",
      "You don't have any pending tasks.",
    );

    return;
  }

  elements.upcomingTasks.innerHTML = tasks.map(createUpcomingTask).join("");
}

function createUpcomingTask(task) {
  return `
    <div class="task-row">

      <div class="task-main">

        <div class="task-title">
          ${escapeHtml(task.title || "Untitled Task")}
        </div>

        <div class="task-meta">

          <span>
            <i class="fa-regular fa-calendar"></i>
            ${formatDateTime(task.scheduledAt)}
          </span>

          <span>
            <i class="fa-regular fa-clock"></i>
            ${getDeadlineLabel(task)}
          </span>

        </div>

      </div>

      <div class="task-side">

        ${createStatusBadge(task.calculatedStatus)}

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
// TASKS
// ============================================================

function renderTasks() {
  let tasks = [...state.tasks];

  if (state.currentFilter !== "all") {
    tasks = tasks.filter(
      (task) => task.calculatedStatus === state.currentFilter,
    );
  }

  tasks.sort(
    (a, b) => getDateValue(a.scheduledAt) - getDateValue(b.scheduledAt),
  );

  if (!tasks.length) {
    elements.allTasks.innerHTML = createEmptyState(
      "No tasks",
      "There are no tasks matching this filter.",
    );

    return;
  }

  elements.allTasks.innerHTML = tasks.map(createTaskCard).join("");
}

function createTaskCard(task) {
  const status = task.calculatedStatus;

  const scheduled = formatDateTime(task.scheduledAt);

  const deadline = formatDateTime(task.deadline);

  const description = task.description || "No description provided.";

  return `
    <article class="task-card ${status}">

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
          <span>Scheduled</span>

          <strong>
            ${scheduled}
          </strong>
        </div>

        <div class="info-box">
          <span>Deadline</span>

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
          Open
          <i class="fa-solid fa-arrow-right"></i>
        </button>

      </div>

    </article>
  `;
}

// ============================================================
// OPEN TASK
// ============================================================

async function openTask(taskId) {
  try {
    const task = await getTask(taskId);

    if (!task) {
      showToast("Task not found", "This task no longer exists.", "error");

      return;
    }

    const normalized = {
      ...task,
      calculatedStatus: calculateTaskStatus(task),
    };

    state.selectedTask = normalized;

    renderTaskModal(normalized);

    openModal();
  } catch (error) {
    console.error("Open task error:", error);

    showToast("Unable to open task", getReadableFirebaseError(error), "error");
  }
}

function renderTaskModal(task) {
  const status = task.calculatedStatus;

  elements.modalTaskTitle.textContent = task.title || "Untitled Task";

  elements.modalTaskStatus.textContent = statusLabel(status);

  elements.modalTaskStatus.className = `status-badge ${status}`;

  elements.modalScheduled.textContent = formatDateTime(task.scheduledAt);

  elements.modalDeadline.textContent = formatDateTime(task.deadline);

  if (task.description) {
    elements.modalDescriptionContainer.style.display = "";

    elements.modalDescription.textContent = task.description;
  } else {
    elements.modalDescriptionContainer.style.display = "none";
  }

  const link = task.link || task.postUrl || "";

  if (link) {
    elements.modalLinkContainer.style.display = "";

    elements.modalTaskLink.href = link;
  } else {
    elements.modalLinkContainer.style.display = "none";

    elements.modalTaskLink.removeAttribute("href");
  }

  if (status === "expired") {
    elements.deadlineWarning.style.display = "flex";
  } else {
    elements.deadlineWarning.style.display = "none";
  }

  if (status === "pending") {
    elements.completeTaskButton.style.display = "";

    elements.completeTaskButton.disabled = false;

    elements.completeTaskButton.innerHTML = `
      <i class="fa-solid fa-check"></i>
      Mark as Completed
    `;
  } else {
    elements.completeTaskButton.style.display = "none";
  }
}

// ============================================================
// COMPLETE
// ============================================================

async function handleCompleteTask() {
  const task = state.selectedTask;

  if (!task) {
    return;
  }

  if (task.calculatedStatus !== "pending") {
    showToast(
      "Task unavailable",
      task.calculatedStatus === "expired"
        ? "The deadline has passed."
        : "This task is already completed.",
      "error",
    );

    return;
  }

  try {
    elements.completeTaskButton.disabled = true;

    elements.completeTaskButton.innerHTML = `
      <span class="spinner"></span>
      Completing...
    `;

    await completeTask(task.id);

    closeModal();

    showToast("Task completed", "The task has been marked as completed.");

    await loadTasks();
  } catch (error) {
    console.error("Complete task error:", error);

    showToast(
      "Unable to complete task",
      getReadableFirebaseError(error),
      "error",
    );

    if (state.selectedTask) {
      elements.completeTaskButton.disabled = false;

      elements.completeTaskButton.innerHTML = `
        <i class="fa-solid fa-check"></i>
        Mark as Completed
      `;
    }
  }
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

      state.currentFilter = button.dataset.filter;

      renderTasks();
    });
  });
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

  elements.viewAllTasksButton?.addEventListener("click", () => {
    showSection("tasks");

    document
      .querySelectorAll(".nav-item")
      .forEach((item) =>
        item.classList.toggle("active", item.dataset.section === "tasks"),
      );
  });

  elements.refreshButton?.addEventListener("click", loadTasks);

  elements.logoutButton?.addEventListener("click", async () => {
    try {
      await logoutUser();

      window.location.replace("login.html");
    } catch (error) {
      console.error("Logout error:", error);
    }
  });

  elements.completeTaskButton?.addEventListener("click", handleCompleteTask);
}

// ============================================================
// MODAL
// ============================================================

function setupModal() {
  elements.closeModalButton?.addEventListener("click", closeModal);

  elements.cancelModalButton?.addEventListener("click", closeModal);

  elements.taskModal?.addEventListener("click", (event) => {
    if (event.target === elements.taskModal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });

  elements.closeToast?.addEventListener("click", hideToast);
}

function openModal() {
  elements.taskModal?.classList.add("active");

  document.body.style.overflow = "hidden";
}

function closeModal() {
  elements.taskModal?.classList.remove("active");

  document.body.style.overflow = "";

  state.selectedTask = null;
}

// ============================================================
// STATUS REFRESH
// ============================================================

function refreshStatuses() {
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

  if (isLoading && state.tasks.length === 0) {
    if (elements.upcomingTasks) {
      elements.upcomingTasks.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <span>Loading tasks...</span>
        </div>
      `;
    }

    if (elements.allTasks) {
      elements.allTasks.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <span>Loading tasks...</span>
        </div>
      `;
    }
  }
}

// ============================================================
// ERROR UI
// ============================================================

function renderTasksError() {
  elements.upcomingTasks.innerHTML = createEmptyState(
    "Unable to load tasks",
    "Please refresh and try again.",
  );

  elements.allTasks.innerHTML = createEmptyState(
    "Unable to load tasks",
    "Please refresh and try again.",
  );
}

// ============================================================
// HELPERS
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

  const difference = deadline.getTime() - Date.now();

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

function statusLabel(status) {
  return (
    {
      pending: "Pending",
      completed: "Completed",
      expired: "Expired",
    }[status] || "Unknown"
  );
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
