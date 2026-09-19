// ============================================================
// admin.js
// Admin UI / Page Logic
//
// IMPORTANT:
// No Firebase SDK is imported here.
// All Firebase communication goes through firebase.js.
// ============================================================

import {
  listenToAuthState,
  logoutUser,
  getUser,
  getUsers,
  getAllTasks,
  createTask,
  calculateTaskStatus,
  convertFirebaseDate,
} from "./firebase.js";

// ============================================================
// STATE
// ============================================================

const state = {
  authUser: null,

  profile: null,

  users: [],

  tasks: [],

  taskFilter: "all",

  taskUserFilter: "all",

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
};

// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  setupNavigation();

  setupFilters();

  setupModals();

  setupActions();

  listenToAuthentication();
}

// ============================================================
// AUTH
// ============================================================

function listenToAuthentication() {
  listenToAuthState(async (user) => {
    if (!user) {
      window.location.href = "login.html";

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
      showToast("Account Error", "Admin profile was not found.", "error");

      return;
    }

    state.profile = profile;

    // Important:
    // The role must be verified server-side
    // through Firebase Security Rules as well.

    if (profile.role !== "admin") {
      showToast(
        "Access denied",
        "This account is not an administrator.",
        "error",
      );

      setTimeout(() => {
        window.location.href = "employee.html";
      }, 1500);

      return;
    }

    renderProfile();

    await loadData();
  } catch (error) {
    console.error("Admin initialization error:", error);

    showToast("Error", getReadableError(error), "error");
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

    showToast("Unable to load data", getReadableError(error), "error");
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

                        ${escapeHtml(assignedUser?.name || "Unassigned")}

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
// TEAM OVERVIEW
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
                                    ${
                                      user.role === "admin"
                                        ? "Administrator"
                                        : "Employee"
                                    }
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

                <span>
                    Assigned To
                </span>

                ${escapeHtml(assignedUser?.name || "Unassigned")}

            </div>


            <div class="admin-task-info">

                <span>
                    Deadline
                </span>

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

  const visible = user.showTasks !== false;

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

                    <i class="fa-solid ${
                      visible ? "fa-eye" : "fa-eye-slash"
                    }"></i>

                    ${visible ? "Visible" : "Hidden"}

                </span>

            </td>


            <td>

                <span class="visibility ${
                  user.active !== false ? "on" : "off"
                }">

                    <i class="fa-solid ${
                      user.active !== false
                        ? "fa-circle-check"
                        : "fa-circle-xmark"
                    }"></i>

                    ${user.active !== false ? "Active" : "Disabled"}

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
            (user) =>
              `
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
            (user) =>
              `
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

  if (deadline <= scheduledAt) {
    showToast(
      "Invalid deadline",
      "Deadline must be after the scheduled time.",
      "error",
    );

    return;
  }

  try {
    const submitButton = el.taskForm.querySelector('button[type="submit"]');

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

    showToast("Unable to create task", getReadableError(error), "error");
  } finally {
    const submitButton = el.taskForm.querySelector('button[type="submit"]');

    submitButton.disabled = false;

    submitButton.innerHTML = `
                <i class="fa-solid fa-plus"></i>
                Create Task
            `;
  }
}

// ============================================================
// EDIT USER
// ============================================================
//
// The actual updateUser() function will be added to
// firebase.js. The UI is already prepared for it.
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
    user.showTasks !== false,
  );

  document.getElementById("editUserStatus").value = String(
    user.active !== false,
  );

  openModal("editUserModal");
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
  el.addTaskButton.addEventListener("click", () => openModal("taskModal"));

  el.dashboardAddTaskButton.addEventListener("click", () =>
    openModal("taskModal"),
  );

  el.addUserButton.addEventListener("click", () => openModal("userModal"));

  el.refreshButton.addEventListener("click", loadData);

  el.logoutButton.addEventListener("click", async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error(error);
    }
  });

  el.taskForm.addEventListener("submit", handleCreateTask);

  // Future Firebase user update function
  // will be connected here.

  el.editUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    showToast(
      "Ready",
      "User update function will be connected through firebase.js.",
      "error",
    );
  });

  document.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-user]");

    if (editButton) {
      openEditUser(editButton.dataset.editUser);
    }
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
// HELPERS
// ============================================================

function getUserById(userId) {
  return state.users.find((user) => user.id === userId);
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

  if (!date) {
    return 0;
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

function setLoading(value) {
  state.loading = value;
}

function getReadableError(error) {
  if (!error) {
    return "Something went wrong.";
  }

  const messages = {
    "permission-denied": "You don't have permission to perform this action.",

    "failed-precondition": "Firestore requires an index for this request.",

    "auth/network-request-failed":
      "Network error. Please check your connection.",
  };

  if (messages[error.code]) {
    return messages[error.code];
  }

  return error.message || "Something went wrong.";
}

// ============================================================
// TOAST
// ============================================================

let toastTimer;

function showToast(title, message, type = "success") {
  el.toastTitle.textContent = title;

  el.toastMessage.textContent = message;

  const icon = el.toast.querySelector(".toast-icon i");

  const iconContainer = el.toast.querySelector(".toast-icon");

  if (type === "error") {
    icon.className = "fa-solid fa-circle-exclamation";

    iconContainer.style.background = "var(--danger-bg)";

    iconContainer.style.color = "var(--danger)";
  } else {
    icon.className = "fa-solid fa-check";

    iconContainer.style.background = "var(--success-bg)";

    iconContainer.style.color = "var(--success)";
  }

  el.toast.classList.add("active");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => el.toast.classList.remove("active"), 4000);
}

el.closeToast.addEventListener("click", () =>
  el.toast.classList.remove("active"),
);
