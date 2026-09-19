// ============================================================
// firebase.js
// Central Firebase Data Layer
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
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// ============================================================
// CONFIG
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
// INITIALIZE
// ============================================================

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

// Secondary app.
// Used when Admin creates another Firebase Auth account.
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");

const secondaryAuth = getAuth(secondaryApp);

// ============================================================
// COLLECTIONS
// ============================================================

const USERS_COLLECTION = "users";
const TASKS_COLLECTION = "tasks";

// ============================================================
// HELPERS
// ============================================================

function requireAuth() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("يجب تسجيل الدخول أولاً.");
  }

  return user;
}

function timestampToDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  if (typeof value === "string") {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

function toTimestamp(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Timestamp) {
    return value;
  }

  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return Timestamp.fromDate(date);
  }

  return null;
}

function normalizeUser(snapshot) {
  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    uid: snapshot.id,
    ...snapshot.data(),
  };
}

function normalizeTask(snapshot) {
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();

  return normalizeTaskObject({
    id: snapshot.id,
    ...data,
  });
}

function normalizeTaskObject(task) {
  if (!task) {
    return null;
  }

  const scheduledAt = task.scheduledAt ?? task.scheduledTime ?? null;

  const deadline =
    task.deadline ??
    (task.dueDate && task.dueTime ? `${task.dueDate}T${task.dueTime}` : null);

  const assignedTo = task.assignedTo ?? task.assigneeId ?? null;

  const completed = task.completed === true || task.status === "completed";

  return {
    ...task,

    id: task.id,

    title: task.title || task.description || "Untitled Task",

    description: task.description || "",

    link: task.link || task.postUrl || "",

    assignedTo,

    scheduledAt,

    deadline,

    completed,

    calculatedStatus: calculateTaskStatus({
      ...task,
      scheduledAt,
      deadline,
      completed,
    }),
  };
}

// ============================================================
// AUTH
// ============================================================

export async function login(email, password) {
  if (!email?.trim()) {
    throw new Error("البريد الإلكتروني مطلوب.");
  }

  if (!password) {
    throw new Error("كلمة المرور مطلوبة.");
  }

  const result = await signInWithEmailAndPassword(auth, email.trim(), password);

  return result.user;
}

export async function logout() {
  await signOut(auth);
}

export function getFirebaseUser() {
  return auth.currentUser;
}

// Current API
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// Compatibility API used by the existing UI
export function listenToAuthState(callback) {
  return watchAuth(callback);
}

export function getCurrentAuthUser() {
  return auth.currentUser;
}

// ============================================================
// USER PROFILE
// ============================================================

export async function getUserById(uid) {
  if (!uid) {
    return null;
  }

  const snapshot = await getDoc(doc(db, USERS_COLLECTION, uid));

  return normalizeUser(snapshot);
}

// Compatibility name used by existing UI
export async function getUser(uid) {
  return getUserById(uid);
}

export async function getCurrentUserProfile() {
  const user = requireAuth();

  return getUserById(user.uid);
}

// ============================================================
// USERS
// ============================================================

export async function getUsers() {
  requireAuth();

  const snapshot = await getDocs(collection(db, USERS_COLLECTION));

  return snapshot.docs.map((item) => ({
    id: item.id,
    uid: item.id,
    ...item.data(),
  }));
}

export async function getEmployees() {
  const users = await getUsers();

  return users.filter(
    (user) => user.role === "employee" && user.active !== false,
  );
}

export async function getAdmins() {
  const users = await getUsers();

  return users.filter((user) => user.role === "admin" && user.active !== false);
}

export function watchUsers(callback) {
  requireAuth();

  return onSnapshot(collection(db, USERS_COLLECTION), (snapshot) => {
    const users = snapshot.docs.map((item) => ({
      id: item.id,
      uid: item.id,
      ...item.data(),
    }));

    callback(users);
  });
}

// ============================================================
// CREATE USER
// ============================================================

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

  if (role !== "admin" && role !== "employee") {
    throw new Error("نوع المستخدم غير صحيح.");
  }

  // Create Firebase Auth account
  const result = await createUserWithEmailAndPassword(
    secondaryAuth,
    email.trim(),
    password,
  );

  const newUser = result.user;

  try {
    await updateProfile(newUser, {
      displayName: name.trim(),
    });
  } catch (error) {
    console.warn("Display name update failed:", error);
  }

  const userData = {
    uid: newUser.uid,

    name: name.trim(),

    email: email.trim().toLowerCase(),

    role,

    active,

    receiveTasks,

    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, USERS_COLLECTION, newUser.uid), userData);

  await signOut(secondaryAuth);

  return {
    id: newUser.uid,
    ...userData,
  };
}

// ============================================================
// UPDATE USER
// ============================================================

export async function updateUser(uid, data) {
  requireAuth();

  if (!uid) {
    throw new Error("User ID is required.");
  }

  const update = {};

  if (data.name !== undefined) {
    update.name = String(data.name).trim();
  }

  if (data.email !== undefined) {
    update.email = String(data.email).trim().toLowerCase();
  }

  if (data.role !== undefined) {
    if (data.role !== "admin" && data.role !== "employee") {
      throw new Error("نوع المستخدم غير صحيح.");
    }

    update.role = data.role;
  }

  if (data.receiveTasks !== undefined) {
    update.receiveTasks = Boolean(data.receiveTasks);
  }

  // Compatibility with old UI
  if (data.showTasks !== undefined) {
    update.receiveTasks = Boolean(data.showTasks);
  }

  if (data.active !== undefined) {
    update.active = Boolean(data.active);
  }

  update.updatedAt = serverTimestamp();

  await updateDoc(doc(db, USERS_COLLECTION, uid), update);

  return getUserById(uid);
}

// ============================================================
// DELETE USER PROFILE
// ============================================================

export async function deleteUser(uid) {
  requireAuth();

  if (!uid) {
    throw new Error("User ID is required.");
  }

  if (uid === auth.currentUser?.uid) {
    throw new Error("لا يمكنك حذف حسابك الحالي.");
  }

  await deleteDoc(doc(db, USERS_COLLECTION, uid));

  return true;
}

// ============================================================
// TASKS
// ============================================================

export async function createTask({
  title = "",
  description = "",
  link = "",
  createdBy = null,
  assignedTo = null,
  scheduledAt = null,
  deadline = null,

  // New structure compatibility
  postUrl = null,
  dueDate = null,
  dueTime = null,
  visibility = "employees",
  assignees = null,
}) {
  const currentUser = requireAuth();

  const creator = await getUserById(currentUser.uid);

  const finalCreatedBy = createdBy || currentUser.uid;

  let finalAssignees = [];

  if (Array.isArray(assignees)) {
    finalAssignees = assignees.map((person) => ({
      uid: person.uid,

      name: person.name,

      scheduledAt: person.scheduledAt || null,

      status: person.status || "pending",

      completedAt: null,
    }));
  } else if (assignedTo) {
    const assignedUser = await getUserById(assignedTo);

    if (assignedUser) {
      finalAssignees = [
        {
          uid: assignedUser.uid,

          name: assignedUser.name,

          scheduledAt: scheduledAt || null,

          status: "pending",

          completedAt: null,
        },
      ];
    }
  }

  const taskData = {
    title: title.trim(),

    description: description.trim(),

    link: (link || postUrl || "").trim(),

    postUrl: (postUrl || link || "").trim(),

    createdBy: finalCreatedBy,

    createdByName:
      creator?.name || currentUser.displayName || currentUser.email,

    assignedTo: assignedTo || finalAssignees[0]?.uid || null,

    scheduledAt: toTimestamp(scheduledAt),

    deadline: toTimestamp(deadline),

    dueDate: dueDate || (deadline ? formatDateForInput(deadline) : null),

    dueTime: dueTime || (deadline ? formatTimeForInput(deadline) : null),

    visibility,

    status: "open",

    completed: false,

    assignees: finalAssignees,

    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, TASKS_COLLECTION), taskData);

  return {
    id: ref.id,
    ...normalizeTaskObject({
      id: ref.id,
      ...taskData,
    }),
  };
}

// ============================================================
// GET TASK
// ============================================================

export async function getTask(taskId) {
  if (!taskId) {
    return null;
  }

  const snapshot = await getDoc(doc(db, TASKS_COLLECTION, taskId));

  return normalizeTask(snapshot);
}

// ============================================================
// GET ALL TASKS
// ============================================================

export async function getTasks() {
  requireAuth();

  const q = query(
    collection(db, TASKS_COLLECTION),
    orderBy("createdAt", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((item) =>
    normalizeTaskObject({
      id: item.id,
      ...item.data(),
    }),
  );
}

// Compatibility API
export async function getAllTasks() {
  return getTasks();
}

// ============================================================
// GET TASKS FOR USER
// ============================================================

export async function getTasksForUser(userId) {
  requireAuth();

  const tasks = await getTasks();

  return tasks.filter((task) => {
    if (task.assignedTo === userId) {
      return true;
    }

    if (Array.isArray(task.assignees)) {
      return task.assignees.some((person) => person.uid === userId);
    }

    return false;
  });
}

// ============================================================
// WATCH TASKS
// ============================================================

export function watchTasks(callback) {
  requireAuth();

  const q = query(
    collection(db, TASKS_COLLECTION),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map((item) =>
      normalizeTaskObject({
        id: item.id,
        ...item.data(),
      }),
    );

    callback(tasks);
  });
}

// ============================================================
// UPDATE TASK
// ============================================================

export async function updateTask(taskId, data) {
  requireAuth();

  const update = {};

  const allowedFields = [
    "title",
    "description",
    "link",
    "postUrl",
    "assignedTo",
    "visibility",
    "status",
    "completed",
    "assignees",
    "scheduledAt",
    "deadline",
    "dueDate",
    "dueTime",
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === "scheduledAt" || field === "deadline") {
        update[field] = toTimestamp(data[field]);
      } else {
        update[field] = data[field];
      }
    }
  }

  update.updatedAt = serverTimestamp();

  await updateDoc(doc(db, TASKS_COLLECTION, taskId), update);

  return getTask(taskId);
}

// ============================================================
// DELETE TASK
// ============================================================

export async function deleteTask(taskId) {
  requireAuth();

  await deleteDoc(doc(db, TASKS_COLLECTION, taskId));

  return true;
}

// ============================================================
// COMPLETE TASK
// ============================================================

export async function completeTask(taskId) {
  const user = requireAuth();

  const task = await getTask(taskId);

  if (!task) {
    throw new Error("المهمة غير موجودة.");
  }

  // New assignee model
  if (Array.isArray(task.assignees) && task.assignees.length) {
    const assignees = task.assignees.map((person) => {
      if (person.uid !== user.uid) {
        return person;
      }

      return {
        ...person,

        status: "done",

        completedAt: serverTimestamp(),
      };
    });

    await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
      assignees,

      updatedAt: serverTimestamp(),
    });

    return getTask(taskId);
  }

  // Old / simple model
  if (task.assignedTo !== user.uid) {
    throw new Error("هذه المهمة ليست مسندة إليك.");
  }

  await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
    completed: true,

    status: "completed",

    completedAt: serverTimestamp(),

    updatedAt: serverTimestamp(),
  });

  return getTask(taskId);
}

// ============================================================
// TASK STATUS
// ============================================================

export function calculateTaskStatus(task) {
  if (!task) {
    return "pending";
  }

  // Completed
  if (task.completed === true || task.status === "completed") {
    return "completed";
  }

  // New assignee model
  if (Array.isArray(task.assignees)) {
    const currentUserId = auth.currentUser?.uid;

    if (currentUserId) {
      const assignment = task.assignees.find(
        (person) => person.uid === currentUserId,
      );

      if (assignment?.status === "done") {
        return "completed";
      }
    }
  }

  const deadline = timestampToDate(task.deadline);

  if (!deadline && task.dueDate && task.dueTime) {
    const parsed = new Date(`${task.dueDate}T${task.dueTime}`);

    if (!Number.isNaN(parsed.getTime())) {
      if (Date.now() > parsed.getTime()) {
        return "expired";
      }
    }
  } else if (deadline) {
    if (Date.now() > deadline.getTime()) {
      return "expired";
    }
  }

  return "pending";
}

// ============================================================
// DATE CONVERTER
// ============================================================

export function convertFirebaseDate(value) {
  return timestampToDate(value);
}

// ============================================================
// SCHEDULE
// ============================================================

export function createSchedule({
  users,
  date,
  startTime = "09:00",
  endTime = "21:00",
}) {
  const activeUsers = users.filter(
    (user) => user.active !== false && user.receiveTasks !== false,
  );

  if (!activeUsers.length) {
    return [];
  }

  const start = parseTime(startTime);

  const end = parseTime(endTime);

  if (start === null || end === null || end <= start) {
    throw new Error("وقت البداية والنهاية غير صحيح.");
  }

  const interval =
    activeUsers.length === 1 ? 0 : (end - start) / (activeUsers.length - 1);

  return activeUsers.map((user, index) => {
    const minutes = Math.round(start + interval * index);

    return {
      uid: user.uid || user.id,

      name: user.name,

      scheduledAt: `${date}T${minutesToTime(minutes)}`,

      status: "pending",

      completedAt: null,
    };
  });
}

function parseTime(time) {
  if (typeof time !== "string") {
    return null;
  }

  const parts = time.split(":");

  if (parts.length !== 2) {
    return null;
  }

  const hours = Number(parts[0]);

  const minutes = Number(parts[1]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);

  const mins = minutes % 60;

  return (
    `${String(hours).padStart(2, "0")}:` + `${String(mins).padStart(2, "0")}`
  );
}

// ============================================================
// DASHBOARD STATS
// ============================================================

export async function getDashboardStats() {
  const users = await getUsers();

  const tasks = await getTasks();

  let completed = 0;
  let pending = 0;
  let expired = 0;

  tasks.forEach((task) => {
    const status = calculateTaskStatus(task);

    if (status === "completed") {
      completed++;
    } else if (status === "expired") {
      expired++;
    } else {
      pending++;
    }
  });

  return {
    users: users.length,

    employees: users.filter((user) => user.role === "employee").length,

    admins: users.filter((user) => user.role === "admin").length,

    activeUsers: users.filter((user) => user.active !== false).length,

    tasks: tasks.length,

    completed,

    pending,

    expired,
  };
}

// ============================================================
// DATE HELPERS
// ============================================================

export function formatDate(value, locale = "en-US") {
  const date = timestampToDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatTime(value, locale = "en-US") {
  const date = timestampToDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateForInput(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTimeForInput(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const hours = String(date.getHours()).padStart(2, "0");

  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

// ============================================================
// EXPORTS
// ============================================================

export { auth, db, app, secondaryAuth };
