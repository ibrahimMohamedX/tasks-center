// ============================================================
// Firebase Core
// Shared Firebase Layer
// Used by:
//   - employee.html / employee.js
//   - admin.html / admin.js
//
// IMPORTANT:
// Do NOT call Firebase directly from employee.js or admin.js.
// Everything should go through this file.
// ============================================================

// ============================================================
// Firebase Imports
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// ============================================================
// Firebase Configuration
// ============================================================
//
// Replace this with your Firebase project configuration.
// Firebase Console:
// Project Settings
// -> Your apps
// -> SDK setup and configuration
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyAreXF_U51NYnqtLHZ37vU41b9Rv3M00gs",

  authDomain: "archai-tasks-manager.firebaseapp.com",

  projectId: "archai-tasks-manager",

  storageBucket: "archai-tasks-manager.firebasestorage.app",

  messagingSenderId: "127267057347",

  appId: "1:127267057347:web:edb04505a80eba36d47c76",

  measurementId: "G-ZFW35C5NDE",
};

// ============================================================
// Main Firebase App
// ============================================================

const app = initializeApp(firebaseConfig);

// Main Auth
const auth = getAuth(app);

// Firestore
const db = getFirestore(app);

// ============================================================
// Secondary Firebase App
// ============================================================
//
// Used only when an Admin creates another user.
//
// Why?
//
// If we call createUserWithEmailAndPassword() using the main
// auth instance, Firebase will automatically log the newly
// created user in and the Admin session will be replaced.
//
// Therefore we create the new account using a SECOND Firebase
// app instance.
//
// This keeps the Admin logged in.
// ============================================================

const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");

const secondaryAuth = getAuth(secondaryApp);

// ============================================================
// Collection Names
// ============================================================

const USERS_COLLECTION = "users";
const TASKS_COLLECTION = "tasks";

// ============================================================
// Utility Functions
// ============================================================

function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Timestamp) {
    return value;
  }

  if (value?.toDate) {
    return value;
  }

  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }

  if (typeof value === "string") {
    const date = new Date(value);

    if (!isNaN(date.getTime())) {
      return Timestamp.fromDate(date);
    }
  }

  return null;
}

function timestampToDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value?.toDate) {
    return value.toDate();
  }

  return null;
}

function timestampToISO(value) {
  const date = timestampToDate(value);

  if (!date) {
    return null;
  }

  return date.toISOString();
}

function getCurrentUid() {
  return auth.currentUser?.uid || null;
}

function requireAuth() {
  if (!auth.currentUser) {
    throw new Error("يجب تسجيل الدخول أولاً.");
  }

  return auth.currentUser;
}

// ============================================================
// AUTH
// ============================================================

/**
 * Login
 */
export async function login(email, password) {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);

  return result.user;
}

/**
 * Logout
 */
export async function logout() {
  await signOut(auth);
}

/**
 * Listen to authentication state
 */
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get currently logged in Firebase user
 */
export function getFirebaseUser() {
  return auth.currentUser;
}

/**
 * Get currently logged in user's Firestore profile
 */
export async function getCurrentUserProfile() {
  const user = requireAuth();

  return await getUserById(user.uid);
}

// ============================================================
// USERS
// ============================================================

/**
 * Get one user by UID
 */
export async function getUserById(uid) {
  if (!uid) {
    return null;
  }

  const ref = doc(db, USERS_COLLECTION, uid);

  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    return null;
  }

  return {
    uid: snapshot.id,
    ...snapshot.data(),
  };
}

/**
 * Get all users
 */
export async function getUsers() {
  const ref = collection(db, USERS_COLLECTION);

  const snapshot = await getDocs(ref);

  return snapshot.docs.map((item) => ({
    uid: item.id,
    ...item.data(),
  }));
}

/**
 * Get only employees
 */
export async function getEmployees() {
  const users = await getUsers();

  return users.filter(
    (user) => user.role === "employee" && user.active !== false,
  );
}

/**
 * Get only admins
 */
export async function getAdmins() {
  const users = await getUsers();

  return users.filter((user) => user.role === "admin" && user.active !== false);
}

/**
 * Listen to all users in real-time
 */
export function watchUsers(callback) {
  const ref = collection(db, USERS_COLLECTION);

  return onSnapshot(
    ref,
    (snapshot) => {
      const users = snapshot.docs.map((item) => ({
        uid: item.id,
        ...item.data(),
      }));

      callback(users);
    },

    (error) => {
      console.error("Users realtime error:", error);
    },
  );
}

/**
 * Create a new user
 *
 * This is intended to be called by Admin.
 *
 * The new Firebase Auth account is created through
 * the secondary Firebase app so the Admin remains logged in.
 */
export async function createUser({
  name,
  email,
  password,
  role = "employee",
  receiveTasks = true,
  active = true,
}) {
  requireAuth();

  if (!name?.trim()) {
    throw new Error("اسم المستخدم مطلوب.");
  }

  if (!email?.trim()) {
    throw new Error("البريد الإلكتروني مطلوب.");
  }

  if (!password || password.length < 6) {
    throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
  }

  if (!["admin", "employee"].includes(role)) {
    throw new Error("نوع المستخدم غير صحيح.");
  }

  // Create Firebase Auth account
  const result = await createUserWithEmailAndPassword(
    secondaryAuth,
    email.trim(),
    password,
  );

  const newUser = result.user;

  // Optional Firebase Auth display name
  try {
    await updateProfile(newUser, {
      displayName: name.trim(),
    });
  } catch (error) {
    console.warn("Could not update Firebase display name:", error);
  }

  // Create Firestore profile
  const userData = {
    uid: newUser.uid,

    name: name.trim(),

    email: email.trim().toLowerCase(),

    role,

    receiveTasks,

    active,

    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, USERS_COLLECTION, newUser.uid), userData);

  // Logout secondary auth
  await signOut(secondaryAuth);

  return {
    uid: newUser.uid,
    ...userData,
  };
}

/**
 * Update user profile
 */
export async function updateUser(uid, data) {
  requireAuth();

  if (!uid) {
    throw new Error("User ID is required.");
  }

  const allowedData = {};

  if (data.name !== undefined) {
    allowedData.name = data.name.trim();
  }

  if (data.email !== undefined) {
    allowedData.email = data.email.trim().toLowerCase();
  }

  if (data.role !== undefined) {
    if (!["admin", "employee"].includes(data.role)) {
      throw new Error("نوع المستخدم غير صحيح.");
    }

    allowedData.role = data.role;
  }

  if (data.receiveTasks !== undefined) {
    allowedData.receiveTasks = Boolean(data.receiveTasks);
  }

  if (data.active !== undefined) {
    allowedData.active = Boolean(data.active);
  }

  allowedData.updatedAt = serverTimestamp();

  await updateDoc(doc(db, USERS_COLLECTION, uid), allowedData);

  return await getUserById(uid);
}

/**
 * Delete user profile from Firestore
 *
 * IMPORTANT:
 * This does NOT delete the Firebase Authentication account.
 * A real Auth deletion requires Firebase Admin SDK / Cloud Function.
 */
export async function deleteUser(uid) {
  requireAuth();

  if (!uid) {
    throw new Error("User ID is required.");
  }

  if (uid === getCurrentUid()) {
    throw new Error("لا يمكنك حذف حسابك الحالي.");
  }

  await deleteDoc(doc(db, USERS_COLLECTION, uid));

  return true;
}

/**
 * Enable / disable user
 */
export async function setUserActive(uid, active) {
  return await updateUser(uid, {
    active: Boolean(active),
  });
}

/**
 * Enable / disable receiving tasks
 */
export async function setUserTaskVisibility(uid, receiveTasks) {
  return await updateUser(uid, {
    receiveTasks: Boolean(receiveTasks),
  });
}

// ============================================================
// TASKS
// ============================================================

/**
 * Create a new task
 *
 * Example:
 *
 * createTask({
 *   postUrl: "...",
 *   description: "...",
 *   dueDate: "2026-09-20",
 *   dueTime: "18:00",
 *   visibility: "employees",
 *   assignees: [...]
 * })
 */
export async function createTask({
  postUrl = "",

  description = "",

  dueDate = null,

  dueTime = null,

  visibility = "employees",

  assignees = [],
}) {
  const user = requireAuth();

  const creator = await getUserById(user.uid);

  const taskData = {
    postUrl: postUrl.trim(),

    description: description.trim(),

    createdBy: user.uid,

    createdByName: creator?.name || user.displayName || user.email,

    createdAt: serverTimestamp(),

    dueDate,

    dueTime,

    visibility,

    status: "open",

    assignees: assignees.map((person) => ({
      uid: person.uid,
      name: person.name,
      scheduledAt: person.scheduledAt || null,
      status: person.status || "pending",
      completedAt: null,
    })),
  };

  const ref = await addDoc(collection(db, TASKS_COLLECTION), taskData);

  return {
    id: ref.id,
    ...taskData,
  };
}

/**
 * Get one task
 */
export async function getTask(taskId) {
  if (!taskId) {
    return null;
  }

  const ref = doc(db, TASKS_COLLECTION, taskId);

  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

/**
 * Get all tasks
 */
export async function getTasks() {
  const ref = collection(db, TASKS_COLLECTION);

  const q = query(ref, orderBy("createdAt", "desc"));

  const snapshot = await getDocs(q);

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));
}

/**
 * Listen to all tasks in real-time
 */
export function watchTasks(callback) {
  const ref = collection(db, TASKS_COLLECTION);

  const q = query(ref, orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const tasks = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      callback(tasks);
    },

    (error) => {
      console.error("Tasks realtime error:", error);
    },
  );
}

/**
 * Listen to one task
 */
export function watchTask(taskId, callback) {
  const ref = doc(db, TASKS_COLLECTION, taskId);

  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);

        return;
      }

      callback({
        id: snapshot.id,
        ...snapshot.data(),
      });
    },

    (error) => {
      console.error("Task realtime error:", error);
    },
  );
}

/**
 * Update task
 */
export async function updateTask(taskId, data) {
  requireAuth();

  if (!taskId) {
    throw new Error("Task ID is required.");
  }

  const allowedData = {};

  if (data.postUrl !== undefined) {
    allowedData.postUrl = data.postUrl.trim();
  }

  if (data.description !== undefined) {
    allowedData.description = data.description.trim();
  }

  if (data.dueDate !== undefined) {
    allowedData.dueDate = data.dueDate;
  }

  if (data.dueTime !== undefined) {
    allowedData.dueTime = data.dueTime;
  }

  if (data.visibility !== undefined) {
    allowedData.visibility = data.visibility;
  }

  if (data.status !== undefined) {
    allowedData.status = data.status;
  }

  if (data.assignees !== undefined) {
    allowedData.assignees = data.assignees;
  }

  allowedData.updatedAt = serverTimestamp();

  await updateDoc(doc(db, TASKS_COLLECTION, taskId), allowedData);

  return await getTask(taskId);
}

/**
 * Delete task
 */
export async function deleteTask(taskId) {
  requireAuth();

  if (!taskId) {
    throw new Error("Task ID is required.");
  }

  await deleteDoc(doc(db, TASKS_COLLECTION, taskId));

  return true;
}

// ============================================================
// TASK ASSIGNEES
// ============================================================

/**
 * Update one employee's status inside a task
 *
 * status:
 *   pending
 *   done
 *   overdue
 */
export async function updateTaskAssigneeStatus({
  taskId,

  userId,

  status,
}) {
  requireAuth();

  const task = await getTask(taskId);

  if (!task) {
    throw new Error("المهمة غير موجودة.");
  }

  if (!["pending", "done", "overdue"].includes(status)) {
    throw new Error("حالة المهمة غير صحيحة.");
  }

  const assignees = Array.isArray(task.assignees) ? [...task.assignees] : [];

  const index = assignees.findIndex((person) => person.uid === userId);

  if (index === -1) {
    throw new Error("المستخدم غير موجود في هذه المهمة.");
  }

  assignees[index] = {
    ...assignees[index],

    status,

    completedAt: status === "done" ? serverTimestamp() : null,
  };

  await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
    assignees,

    updatedAt: serverTimestamp(),
  });

  return await getTask(taskId);
}

/**
 * Mark current employee's task as completed
 */
export async function completeTaskForCurrentUser(taskId) {
  const user = requireAuth();

  return await updateTaskAssigneeStatus({
    taskId,

    userId: user.uid,

    status: "done",
  });
}

/**
 * Get tasks assigned to current employee
 */
export async function getMyTasks() {
  const user = requireAuth();

  const tasks = await getTasks();

  return tasks.filter(
    (task) =>
      Array.isArray(task.assignees) &&
      task.assignees.some((person) => person.uid === user.uid),
  );
}

/**
 * Get current user's assignment
 * inside a specific task
 */
export async function getMyTaskAssignment(task) {
  const user = requireAuth();

  if (!task?.assignees) {
    return null;
  }

  return task.assignees.find((person) => person.uid === user.uid) || null;
}

// ============================================================
// TASK STATUS HELPERS
// ============================================================

/**
 * Determine whether a task is overdue
 */
export function isTaskOverdue(task) {
  if (!task) {
    return false;
  }

  if (task.status === "closed") {
    return false;
  }

  if (!task.dueDate || !task.dueTime) {
    return false;
  }

  const deadline = new Date(`${task.dueDate}T${task.dueTime}`);

  if (isNaN(deadline.getTime())) {
    return false;
  }

  return Date.now() > deadline.getTime();
}

/**
 * Get assignment status dynamically
 */
export function getAssignmentStatus(task, assignment) {
  if (!assignment) {
    return "pending";
  }

  if (assignment.status === "done") {
    return "done";
  }

  if (isTaskOverdue(task)) {
    return "overdue";
  }

  return "pending";
}

/**
 * Calculate task statistics
 */
export function getTaskStats(task) {
  const assignees = Array.isArray(task?.assignees) ? task.assignees : [];

  let completed = 0;

  let pending = 0;

  let overdue = 0;

  assignees.forEach((assignment) => {
    const status = getAssignmentStatus(task, assignment);

    if (status === "done") {
      completed++;
    } else if (status === "overdue") {
      overdue++;
    } else {
      pending++;
    }
  });

  return {
    total: assignees.length,

    completed,

    pending,

    overdue,
  };
}

// ============================================================
// SCHEDULING
// ============================================================

/**
 * Create equally distributed schedule
 *
 * Example:
 *
 * startTime = "09:00"
 * endTime   = "21:00"
 *
 * If there are 5 employees,
 * the employees will be distributed
 * across the available time window.
 */
export function createSchedule({
  users,

  date,

  startTime = "09:00",

  endTime = "21:00",
}) {
  if (!Array.isArray(users)) {
    return [];
  }

  const activeUsers = users.filter(
    (user) => user.active !== false && user.receiveTasks !== false,
  );

  if (activeUsers.length === 0) {
    return [];
  }

  const start = parseTimeToMinutes(startTime);

  const end = parseTimeToMinutes(endTime);

  if (start === null || end === null || end <= start) {
    throw new Error("وقت البداية والنهاية غير صحيح.");
  }

  const totalMinutes = end - start;

  const interval =
    activeUsers.length === 1 ? 0 : totalMinutes / (activeUsers.length - 1);

  return activeUsers.map((user, index) => {
    const minutes = Math.round(start + interval * index);

    const time = minutesToTime(minutes);

    return {
      uid: user.uid,

      name: user.name,

      scheduledAt: `${date}T${time}`,

      status: "pending",

      completedAt: null,
    };
  });
}

/**
 * Convert HH:mm -> minutes
 */
function parseTimeToMinutes(time) {
  if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

/**
 * Convert minutes -> HH:mm
 */
function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);

  const mins = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// ============================================================
// ADMIN STATISTICS
// ============================================================

/**
 * Get dashboard statistics
 */
export async function getDashboardStats() {
  const users = await getUsers();

  const tasks = await getTasks();

  let completed = 0;

  let pending = 0;

  let overdue = 0;

  tasks.forEach((task) => {
    const stats = getTaskStats(task);

    completed += stats.completed;

    pending += stats.pending;

    overdue += stats.overdue;
  });

  return {
    users: users.length,

    employees: users.filter((user) => user.role === "employee").length,

    admins: users.filter((user) => user.role === "admin").length,

    activeUsers: users.filter((user) => user.active !== false).length,

    tasks: tasks.length,

    completed,

    pending,

    overdue,
  };
}

// ============================================================
// DATE / TIME HELPERS
// ============================================================

/**
 * Format Firebase timestamp
 */
export function formatDate(value, locale = "ar-EG") {
  const date = timestampToDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Format only time
 */
export function formatTime(value, locale = "ar-EG") {
  let date = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    const parsed = new Date(value);

    if (!isNaN(parsed.getTime())) {
      date = parsed;
    }
  } else {
    date = timestampToDate(value);
  }

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Return ISO date from Firebase timestamp
 */
export function toISO(value) {
  return timestampToISO(value);
}

// ============================================================
// EXPORTS
// ============================================================

export { auth, db, app, secondaryAuth };
