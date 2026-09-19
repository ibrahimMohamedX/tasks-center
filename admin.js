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
// INIT
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

    await loadData();
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

  el.editUserForm?.addEventListener("submit", handleEditUser);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-user]");

    if (button) {
      openEditUser(button.dataset.editUser);
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
