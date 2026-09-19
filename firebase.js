// ============================================================
// TaskFlow Firebase Core
// ============================================================
//
// IMPORTANT:
// admin.js / employee.js MUST NOT import Firebase SDK directly.
//
// All Firebase communication goes through this file.
//
// ============================================================

import {
  initializeApp,
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

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
// FIREBASE CONFIG
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
// APP
// ============================================================

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

// ============================================================
// SECONDARY APP
// Used when admin creates another Firebase Auth user.
// ============================================================

const secondaryAppName = "taskflow-secondary";

let secondaryApp;

try {
  secondaryApp = getApp(secondaryAppName);
} catch {
  secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
}

const secondaryAuth = getAuth(secondaryApp);

// ============================================================
// COLLECTIONS
// ============================================================

const USERS_COLLECTION = "users";
const TASKS_COLLECTION = "tasks";

// ============================================================
// INTERNAL HELPERS
// ============================================================

function requireAuth() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("يجب تسجيل الدخول أولاً.");
  }

  return user;
}

function getCurrentUid() {
  return auth.currentUser?.uid || null;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : value;
}

function dateToTimestamp(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Timestamp) {
    return value;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return Timestamp.fromDate(value);
  }

  if (typeof value === "string") {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return Timestamp.fromDate(date);
  }

  if (value?.toDate) {
    return Timestamp.fromDate(value.toDate());
  }

  return null;
}

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value?.toDate) {
    return value.toDate();
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

function normalizeUser(snapshot) {
  return {
    id: snapshot.id,
    uid: snapshot.id,
    ...snapshot.data(),
  };
}

function normalizeTask(snapshot) {
  const raw = snapshot.data();

  let assignedTo = raw.assignedTo || null;
  let assignedToName = raw.assignedToName || "";

  let assignees = Array.isArray(raw.assignees)
    ? raw.assignees.map((item) => ({
        uid: item.uid,
        name: item.name || "",
        scheduledAt: item.scheduledAt || null,
        status: item.status || "pending",
        completedAt: item.completedAt || null,
      }))
    : [];

  // ----------------------------------------------------------
  // Compatibility with old single-assignee task structure
  // ----------------------------------------------------------

  if (!assignees.length && assignedTo) {
    assignees = [
      {
        uid: assignedTo,
        name: assignedToName,
        scheduledAt: raw.scheduledAt || null,
        status: raw.completedAt ? "done" : "pending",
        completedAt: raw.completedAt || null,
      },
    ];
  }

  if (!assignedTo && assignees.length === 1) {
    assignedTo = assignees[0].uid;
    assignedToName = assignees[0].name;
  }

  const scheduledAt =
    raw.scheduledAt ||
    assignees.find((item) => item.scheduledAt)?.scheduledAt ||
    null;

  const deadline =
    raw.deadline || combineLegacyDueDateTime(raw.dueDate, raw.dueTime);

  return {
    id: snapshot.id,

    ...raw,

    title: raw.title || raw.name || "Untitled Task",

    description: raw.description || "",

    link: raw.link || raw.postUrl || "",

    postUrl: raw.postUrl || raw.link || "",

    assignedTo,

    assignedToName,

    scheduledAt,

    deadline,

    assignees,
  };
}

function combineLegacyDueDateTime(date, time) {
  if (!date || !time) {
    return null;
  }

  const value = `${date}T${time}`;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return Timestamp.fromDate(parsed);
}

function assignmentForCurrentUser(task) {
  const uid = getCurrentUid();

  if (!uid || !Array.isArray(task?.assignees)) {
    return null;
  }

  return task.assignees.find((assignment) => assignment.uid === uid) || null;
}

// ============================================================
// ERROR HANDLING
// ============================================================

export function getReadableFirebaseError(error) {
  if (!error) {
    return "حدث خطأ غير معروف.";
  }

  const code = error.code || "";

  const messages = {
    "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",

    "auth/invalid-login-credentials":
      "البريد الإلكتروني أو كلمة المرور غير صحيحة.",

    "auth/user-not-found": "لا يوجد حساب بهذا البريد الإلكتروني.",

    "auth/wrong-password": "كلمة المرور غير صحيحة.",

    "auth/invalid-email": "البريد الإلكتروني غير صحيح.",

    "auth/email-already-in-use": "هذا البريد الإلكتروني مستخدم بالفعل.",

    "auth/weak-password": "كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.",

    "auth/network-request-failed": "حدثت مشكلة في الاتصال بالإنترنت.",

    "permission-denied": "ليس لديك صلاحية لتنفيذ هذا الإجراء.",

    "failed-precondition":
      "Firebase يحتاج إلى إعداد إضافي قبل تنفيذ هذا الإجراء.",
  };

  return messages[code] || error.message || "حدث خطأ أثناء تنفيذ العملية.";
}

// ============================================================
// AUTH
// ============================================================

export async function login(email, password) {
  const result = await signInWithEmailAndPassword(auth, clean(email), password);

  return result.user;
}

export async function logout() {
  await signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getFirebaseUser() {
  return auth.currentUser;
}

export function getCurrentAuthUser() {
  return auth.currentUser;
}

export async function getCurrentUserProfile() {
  const user = requireAuth();

  return await getUserById(user.uid);
}

// Compatibility aliases
export const listenToAuthState = watchAuth;
export const logoutUser = logout;

// ============================================================
// USERS
// ============================================================

export async function getUserById(uid) {
  if (!uid) {
    return null;
  }

  const snapshot = await getDoc(doc(db, USERS_COLLECTION, uid));

  if (!snapshot.exists()) {
    return null;
  }

  return normalizeUser(snapshot);
}

export const getUser = getUserById;

export async function getUsers() {
  const snapshot = await getDocs(collection(db, USERS_COLLECTION));

  return snapshot.docs.map(normalizeUser);
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
  return onSnapshot(
    collection(db, USERS_COLLECTION),
    (snapshot) => {
      callback(snapshot.docs.map(normalizeUser));
    },
    (error) => {
      console.error("Users realtime error:", error);
    },
  );
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

  name = clean(name);
  email = clean(email)?.toLowerCase();

  if (!name) {
    throw new Error("اسم المستخدم مطلوب.");
  }

  if (!email) {
    throw new Error("البريد الإلكتروني مطلوب.");
  }

  if (!password || password.length < 6) {
    throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
  }

  if (!["admin", "employee"].includes(role)) {
    throw new Error("نوع المستخدم غير صحيح.");
  }

  const result = await createUserWithEmailAndPassword(
    secondaryAuth,
    email,
    password,
  );

  const newUser = result.user;

  try {
    await updateProfile(newUser, {
      displayName: name,
    });
  } catch (error) {
    console.warn("Could not update Firebase display name:", error);
  }

  const userData = {
    uid: newUser.uid,
    name,
    email,
    role,
    receiveTasks: Boolean(receiveTasks),
    showTasks: Boolean(receiveTasks),
    active: Boolean(active),
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, USERS_COLLECTION, newUser.uid), userData);
  } catch (error) {
    try {
      await signOut(secondaryAuth);
    } catch {}

    throw error;
  }

  await signOut(secondaryAuth);

  return {
    uid: newUser.uid,
    id: newUser.uid,
    ...userData,
  };
}

// ============================================================
// UPDATE USER
// ============================================================

export async function updateUser(uid, data = {}) {
  requireAuth();

  if (!uid) {
    throw new Error("User ID is required.");
  }

  const updateData = {};

  if (data.name !== undefined) {
    updateData.name = clean(data.name);
  }

  if (data.role !== undefined) {
    if (!["admin", "employee"].includes(data.role)) {
      throw new Error("نوع المستخدم غير صحيح.");
    }

    updateData.role = data.role;
  }

  if (data.receiveTasks !== undefined) {
    updateData.receiveTasks = Boolean(data.receiveTasks);

    updateData.showTasks = Boolean(data.receiveTasks);
  }

  if (data.showTasks !== undefined) {
    updateData.showTasks = Boolean(data.showTasks);

    updateData.receiveTasks = Boolean(data.showTasks);
  }

  if (data.active !== undefined) {
    updateData.active = Boolean(data.active);
  }

  updateData.updatedAt = serverTimestamp();

  await updateDoc(doc(db, USERS_COLLECTION, uid), updateData);

  return await getUserById(uid);
}

export async function setUserActive(uid, active) {
  return await updateUser(uid, {
    active,
  });
}

export async function setUserTaskVisibility(uid, visible) {
  return await updateUser(uid, {
    showTasks: visible,
  });
}

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

// ============================================================
// TASKS
// ============================================================

export async function createTask({
  title,
  description = "",
  link = "",
  createdBy = null,
  assignedTo = null,
  scheduledAt = null,
  deadline = null,
}) {
  const user = requireAuth();

  if (!title?.trim()) {
    throw new Error("عنوان المهمة مطلوب.");
  }

  if (!assignedTo) {
    throw new Error("يجب اختيار موظف.");
  }

  const employee = await getUserById(assignedTo);

  if (!employee) {
    throw new Error("الموظف غير موجود.");
  }

  if (employee.role !== "employee") {
    throw new Error("لا يمكن تعيين المهمة لهذا المستخدم.");
  }

  if (employee.active === false) {
    throw new Error("هذا الموظف غير مفعل.");
  }

  const scheduledTimestamp = dateToTimestamp(scheduledAt);

  const deadlineTimestamp = dateToTimestamp(deadline);

  if (!scheduledTimestamp || !deadlineTimestamp) {
    throw new Error("وقت المهمة أو الموعد النهائي غير صحيح.");
  }

  if (deadlineTimestamp.toMillis() <= scheduledTimestamp.toMillis()) {
    throw new Error("الموعد النهائي يجب أن يكون بعد وقت المهمة.");
  }

  const creator = await getUserById(user.uid);

  const taskData = {
    title: title.trim(),

    description: description?.trim() || "",

    link: link?.trim() || "",

    postUrl: link?.trim() || "",

    createdBy: createdBy || user.uid,

    createdByName: creator?.name || user.displayName || user.email || "",

    createdAt: serverTimestamp(),

    scheduledAt: scheduledTimestamp,

    deadline: deadlineTimestamp,

    assignedTo: assignedTo,

    assignedToName: employee.name || "",

    status: "pending",

    assignees: [
      {
        uid: employee.uid,
        name: employee.name || "",
        scheduledAt: scheduledTimestamp,
        status: "pending",
        completedAt: null,
      },
    ],
  };

  const ref = await addDoc(collection(db, TASKS_COLLECTION), taskData);

  return {
    id: ref.id,
    ...taskData,
  };
}

export async function getTask(taskId) {
  if (!taskId) {
    return null;
  }

  const snapshot = await getDoc(doc(db, TASKS_COLLECTION, taskId));

  if (!snapshot.exists()) {
    return null;
  }

  return normalizeTask(snapshot);
}

export async function getTasks() {
  const q = query(
    collection(db, TASKS_COLLECTION),
    orderBy("createdAt", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(normalizeTask);
}

export const getAllTasks = getTasks;

export function watchTasks(callback) {
  const q = query(
    collection(db, TASKS_COLLECTION),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map(normalizeTask));
    },
    (error) => {
      console.error("Tasks realtime error:", error);
    },
  );
}

export function watchTask(taskId, callback) {
  return onSnapshot(
    doc(db, TASKS_COLLECTION, taskId),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      callback(normalizeTask(snapshot));
    },
    (error) => {
      console.error("Task realtime error:", error);
    },
  );
}

// ============================================================
// UPDATE / DELETE TASK
// ============================================================

export async function updateTask(taskId, data = {}) {
  requireAuth();

  if (!taskId) {
    throw new Error("Task ID is required.");
  }

  const allowed = {};

  if (data.title !== undefined) {
    allowed.title = clean(data.title);
  }

  if (data.description !== undefined) {
    allowed.description = clean(data.description) || "";
  }

  if (data.link !== undefined) {
    allowed.link = clean(data.link) || "";

    allowed.postUrl = clean(data.link) || "";
  }

  if (data.scheduledAt !== undefined) {
    allowed.scheduledAt = dateToTimestamp(data.scheduledAt);
  }

  if (data.deadline !== undefined) {
    allowed.deadline = dateToTimestamp(data.deadline);
  }

  if (data.assignedTo !== undefined) {
    allowed.assignedTo = data.assignedTo;
  }

  if (data.status !== undefined) {
    allowed.status = data.status;
  }

  if (data.assignees !== undefined) {
    allowed.assignees = data.assignees;
  }

  allowed.updatedAt = serverTimestamp();

  await updateDoc(doc(db, TASKS_COLLECTION, taskId), allowed);

  return await getTask(taskId);
}

export async function deleteTask(taskId) {
  requireAuth();

  await deleteDoc(doc(db, TASKS_COLLECTION, taskId));

  return true;
}

// ============================================================
// EMPLOYEE TASKS
// ============================================================

export async function getTasksForUser(userId) {
  requireAuth();

  if (!userId) {
    return [];
  }

  const tasks = await getTasks();

  return tasks.filter((task) => {
    if (Array.isArray(task.assignees)) {
      return task.assignees.some((assignment) => assignment.uid === userId);
    }

    return task.assignedTo === userId;
  });
}

export async function getMyTasks() {
  const user = requireAuth();

  return await getTasksForUser(user.uid);
}

export async function getMyTaskAssignment(task) {
  requireAuth();

  return assignmentForCurrentUser(task);
}

// ============================================================
// COMPLETE TASK
// ============================================================

export async function completeTaskForCurrentUser(taskId) {
  const user = requireAuth();

  const task = await getTask(taskId);

  if (!task) {
    throw new Error("المهمة غير موجودة.");
  }

  const assignment = assignmentForCurrentUser(task);

  if (!assignment) {
    throw new Error("هذه المهمة غير مسندة إليك.");
  }

  if (assignment.status === "done" || assignment.completedAt) {
    return task;
  }

  const deadline = toDate(task.deadline);

  if (deadline && Date.now() > deadline.getTime()) {
    throw new Error("انتهى موعد هذه المهمة ولا يمكن إكمالها الآن.");
  }

  const assignees = Array.isArray(task.assignees)
    ? task.assignees.map((item) => ({ ...item }))
    : [];

  const index = assignees.findIndex((item) => item.uid === user.uid);

  if (index === -1) {
    throw new Error("تعذر العثور على التكليف.");
  }

  assignees[index] = {
    ...assignees[index],
    status: "done",
    completedAt: Timestamp.now(),
  };

  const allDone =
    assignees.length > 0 && assignees.every((item) => item.status === "done");

  await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
    assignees,
    status: allDone ? "completed" : "pending",
    updatedAt: serverTimestamp(),
  });

  return await getTask(taskId);
}

export const completeTask = completeTaskForCurrentUser;

// ============================================================
// TASK STATUS
// ============================================================

export function calculateTaskStatus(task) {
  if (!task) {
    return "pending";
  }

  const assignment = assignmentForCurrentUser(task);

  if (assignment?.status === "done" || assignment?.completedAt) {
    return "completed";
  }

  if (task.status === "completed") {
    return "completed";
  }

  const deadline = toDate(task.deadline);

  if (deadline && Date.now() > deadline.getTime()) {
    return "expired";
  }

  return "pending";
}

export function getAssignmentStatus(task, assignment) {
  if (assignment?.status === "done" || assignment?.completedAt) {
    return "done";
  }

  const deadline = toDate(task?.deadline);

  if (deadline && Date.now() > deadline.getTime()) {
    return "overdue";
  }

  return "pending";
}

export function isTaskOverdue(task) {
  return calculateTaskStatus(task) === "expired";
}

export function getTaskStats(task) {
  const assignees = Array.isArray(task?.assignees) ? task.assignees : [];

  let completed = 0;
  let pending = 0;
  let overdue = 0;

  for (const assignment of assignees) {
    const status = getAssignmentStatus(task, assignment);

    if (status === "done") {
      completed++;
    } else if (status === "overdue") {
      overdue++;
    } else {
      pending++;
    }
  }

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

export function createSchedule({
  users = [],
  date,
  startTime = "09:00",
  endTime = "21:00",
}) {
  const eligible = users.filter(
    (user) =>
      user.role === "employee" &&
      user.active !== false &&
      user.receiveTasks !== false &&
      user.showTasks !== false,
  );

  if (!eligible.length) {
    return [];
  }

  const start = parseTimeToMinutes(startTime);

  const end = parseTimeToMinutes(endTime);

  if (start === null || end === null || end <= start) {
    throw new Error("وقت البداية والنهاية غير صحيح.");
  }

  const total = end - start;

  const interval = eligible.length === 1 ? 0 : total / (eligible.length - 1);

  return eligible.map((user, index) => {
    const minutes = Math.round(start + interval * index);

    return {
      uid: user.uid,
      name: user.name,
      scheduledAt: `${date}T${minutesToTime(minutes)}`,
      status: "pending",
      completedAt: null,
    };
  });
}

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

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);

  const mins = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// ============================================================
// DASHBOARD STATS
// ============================================================

export async function getDashboardStats() {
  const [users, tasks] = await Promise.all([getUsers(), getTasks()]);

  let pending = 0;
  let completed = 0;
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
    totalTasks: tasks.length,
    pendingTasks: pending,
    completedTasks: completed,
    expiredTasks: expired,

    totalUsers: users.length,

    activeEmployees: users.filter(
      (user) => user.role === "employee" && user.active !== false,
    ).length,
  };
}

// ============================================================
// DATE HELPERS
// ============================================================

export function convertFirebaseDate(value) {
  return toDate(value);
}

export function formatDate(value) {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
}

export function formatTime(value) {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeStyle: "short",
  }).format(date);
}

export function toISO(value) {
  const date = toDate(value);

  return date ? date.toISOString() : null;
}
