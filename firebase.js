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
  getMessaging,
  getToken,
  onMessage,
  isSupported,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging.js";

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
  runTransaction,
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

const VAPID_KEY =
  "BIPRQWxWw8sHm7FpODwGGmHzSDpSNoxzRxgpRRPBP9JR0B9JKthrrSW6jBhM2phSJe4AooLhTg7wIKowRlhu1B4";

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

const MENTIONS_COLLECTION = "mentions";
const MENTION_URLS_COLLECTION = "mentionUrls";
const MENTION_SETTINGS_COLLECTION = "settings";
const MENTION_SETTINGS_DOCUMENT = "mentions";

const DEFAULT_MENTION_LOCK_DURATION_MINUTES = 240;
const MENTION_EXPIRATION_MINUTES = 24 * 60;

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
// MENTIONS HELPERS
// ============================================================

function normalizeMentionUrlInternal(value) {
  if (typeof value !== "string") {
    throw new Error("رابط Facebook مطلوب.");
  }

  const input = value.trim();

  if (!input) {
    throw new Error("رابط Facebook مطلوب.");
  }

  let parsed;

  try {
    parsed = new URL(input);
  } catch {
    throw new Error("رابط Facebook غير صحيح.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("الرابط يجب أن يبدأ بـ http أو https.");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    !hostname.includes("facebook.com") &&
    !hostname.includes("fb.com") &&
    !hostname.includes("fb.watch")
  ) {
    throw new Error("يجب إدخال رابط Facebook صحيح.");
  }

  parsed.hostname = hostname;

  // Remove only the unnecessary trailing slash.
  // Query parameters are intentionally preserved.
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");

  return parsed.toString();
}
/**
 * Create a SHA-256 hash and return it as a lowercase hex string.
 */
async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function hashMentionUrl(value) {
  const normalizedUrl = normalizeMentionUrlInternal(value);

  const data = new TextEncoder().encode(normalizedUrl);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  const hashArray = Array.from(new Uint8Array(hashBuffer));

  const hash = hashArray
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return {
    normalizedUrl,
    hash,
  };
}

function normalizeMention(snapshot) {
  const raw = snapshot.data();

  return {
    id: snapshot.id,
    ...raw,

    queue: Array.isArray(raw.queue) ? raw.queue : [],
    completedBy: Array.isArray(raw.completedBy) ? raw.completedBy : [],
    history: Array.isArray(raw.history) ? raw.history : [],

    totalParticipants:
      typeof raw.totalParticipants === "number"
        ? raw.totalParticipants
        : Array.isArray(raw.queue)
          ? raw.queue.length +
            (Array.isArray(raw.completedBy) ? raw.completedBy.length : 0)
          : 0,

    totalCompleted:
      typeof raw.totalCompleted === "number"
        ? raw.totalCompleted
        : Array.isArray(raw.completedBy)
          ? raw.completedBy.length
          : 0,
  };
}

function timestampMillis(value) {
  const date = toDate(value);
  return date ? date.getTime() : null;
}

function getMentionStatusInternal(mention, now = Date.now()) {
  if (!mention) {
    return "unknown";
  }

  const expiresAt = timestampMillis(mention.expiresAt);

  if (expiresAt !== null && now >= expiresAt) {
    return "expired";
  }

  const queue = Array.isArray(mention.queue) ? mention.queue : [];

  const completedBy = Array.isArray(mention.completedBy)
    ? mention.completedBy
    : [];

  const totalParticipants =
    typeof mention.totalParticipants === "number"
      ? mention.totalParticipants
      : queue.length + completedBy.length;

  if (
    totalParticipants > 0 &&
    completedBy.length >= totalParticipants &&
    queue.length === 0
  ) {
    return "completed";
  }

  const lockUntil = timestampMillis(mention.lockUntil);

  // Active execution lock.
  if (mention.currentLocker && lockUntil !== null && now < lockUntil) {
    return "locked";
  }

  // Cooldown between execution cycles.
  // During this period there is intentionally no currentLocker.
  if (mention.lockReason === "cycle" && lockUntil !== null && now < lockUntil) {
    return "locked";
  }

  const unlockAt = timestampMillis(mention.unlockAt);

  if (unlockAt !== null && now < unlockAt) {
    return "locked";
  }

  return "open";
}

function isMentionExpiredInternal(mention, now = Date.now()) {
  const expiresAt = timestampMillis(mention?.expiresAt);

  return expiresAt !== null && now >= expiresAt;
}

function isMentionLockedInternal(mention, now = Date.now()) {
  return getMentionStatusInternal(mention, now) === "locked";
}

function isMentionOpenInternal(mention, now = Date.now()) {
  return getMentionStatusInternal(mention, now) === "open";
}

function mentionHistoryEvent(type, userId, userName, extra = {}) {
  return {
    type,
    userId: userId || null,
    userName: userName || "",
    timestamp: Timestamp.now(),
    ...extra,
  };
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

    "already-exists": "هذا الرابط تم استخدامه بالفعل في Mention سابقًا.",

    "permission-denied": "ليس لديك صلاحية لتنفيذ هذا الإجراء.",
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
// MENTIONS
// ============================================================

export async function createMention({ url, description = "" } = {}) {
  const authUser = requireAuth();

  const creator = await getUserById(authUser.uid);

  if (!creator) {
    throw new Error("تعذر العثور على ملف المستخدم.");
  }

  if (creator.active === false) {
    throw new Error("الحساب غير مفعل.");
  }

  const { normalizedUrl, hash } = await hashMentionUrl(url);

  const users = await getUsers();

  const eligibleUsers = users.filter(
    (user) =>
      user.active !== false &&
      ["admin", "employee"].includes(user.role) &&
      user.uid !== authUser.uid,
  );

  const settings = await getMentionSettings();

  const lockDurationMinutes =
    Number(settings.defaultLockDurationMinutes) ||
    DEFAULT_MENTION_LOCK_DURATION_MINUTES;

  const now = Timestamp.now();

  const nowDate = now.toDate();

  const unlockAt = Timestamp.fromDate(
    new Date(nowDate.getTime() + lockDurationMinutes * 60 * 1000),
  );

  const expiresAt = Timestamp.fromDate(
    new Date(nowDate.getTime() + MENTION_EXPIRATION_MINUTES * 60 * 1000),
  );

  const mentionRef = doc(collection(db, MENTIONS_COLLECTION));

  const registryRef = doc(db, MENTION_URLS_COLLECTION, hash);

  const queue = eligibleUsers.map((user) => ({
    uid: user.uid,
    name: user.name || "",
    status: "pending",
  }));

  const history = [
    mentionHistoryEvent(
      "created",
      authUser.uid,
      creator.name || authUser.displayName || authUser.email || "",
    ),
  ];

  const mentionData = {
    type: "mention",

    url: clean(url),
    normalizedUrl,

    description: clean(description) || "",

    createdBy: authUser.uid,
    createdByName: creator.name || authUser.displayName || authUser.email || "",

    createdAt: now,

    lockDurationMinutes,

    unlockAt,
    expiresAt,

    status: "locked",

    currentLocker: null,
    lockUntil: null,
    lockReason: null,
    openNotificationSentAt: null,

    queue,

    completedBy: [],

    totalParticipants: queue.length,
    totalCompleted: 0,

    cycles: 0,

    history,
  };

  const registryData = {
    normalizedUrl,
    mentionId: mentionRef.id,
    createdAt: now,
    createdBy: authUser.uid,
    createdByName: creator.name || authUser.displayName || authUser.email || "",
  };

  await runTransaction(db, async (transaction) => {
    const existingRegistry = await transaction.get(registryRef);

    if (existingRegistry.exists()) {
      throw new Error(
        "هذا الرابط تم استخدامه بالفعل في Mention سابقًا ولا يمكن استخدامه مرة أخرى.",
      );
    }

    transaction.set(registryRef, registryData);
    transaction.set(mentionRef, mentionData);
  });

  return {
    id: mentionRef.id,
    ...mentionData,
  };
}

export async function getMention(mentionId) {
  requireAuth();

  if (!mentionId) {
    return null;
  }

  const snapshot = await getDoc(doc(db, MENTIONS_COLLECTION, mentionId));

  if (!snapshot.exists()) {
    return null;
  }

  return normalizeMention(snapshot);
}

export async function getMentions() {
  requireAuth();

  const snapshot = await getDocs(collection(db, MENTIONS_COLLECTION));

  return snapshot.docs.map(normalizeMention).sort((a, b) => {
    const aTime = timestampMillis(a.createdAt) ?? 0;
    const bTime = timestampMillis(b.createdAt) ?? 0;

    return bTime - aTime;
  });
}

export function watchMentions(callback) {
  requireAuth();

  return onSnapshot(
    collection(db, MENTIONS_COLLECTION),
    (snapshot) => {
      const mentions = snapshot.docs.map(normalizeMention).sort((a, b) => {
        const aTime = timestampMillis(a.createdAt) ?? 0;
        const bTime = timestampMillis(b.createdAt) ?? 0;

        return bTime - aTime;
      });

      callback(mentions);
    },
    (error) => {
      console.error("Mentions realtime error:", error);
    },
  );
}

export async function claimMention(mentionId) {
  const authUser = requireAuth();

  const profile = await getUserById(authUser.uid);

  if (!profile) {
    throw new Error("تعذر العثور على المستخدم.");
  }

  if (profile.active === false) {
    throw new Error("الحساب غير مفعل.");
  }

  const mentionRef = doc(db, MENTIONS_COLLECTION, mentionId);

  let result = null;

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(mentionRef);

    if (!snapshot.exists()) {
      throw new Error("الـMention غير موجود.");
    }

    const mention = normalizeMention(snapshot);

    const now = Timestamp.now();
    const nowMillis = now.toMillis();

    if (isMentionExpiredInternal(mention, nowMillis)) {
      throw new Error("انتهت صلاحية هذا الـMention.");
    }

    const completedBy = Array.isArray(mention.completedBy)
      ? mention.completedBy
      : [];

    const queue = Array.isArray(mention.queue) ? mention.queue : [];

    const alreadyCompleted = completedBy.some(
      (item) => item.uid === authUser.uid,
    );

    if (alreadyCompleted) {
      throw new Error("لقد أكملت هذا الـMention بالفعل.");
    }

    const participant = queue.find((item) => item.uid === authUser.uid);

    if (!participant) {
      throw new Error(
        "أنت لست ضمن المشاركين المطلوب منهم تنفيذ هذا الـMention.",
      );
    }

    const status = getMentionStatusInternal(mention, nowMillis);

    if (status === "completed") {
      throw new Error("تم إكمال هذا الـMention بالكامل.");
    }

    if (status === "locked") {
      if (mention.currentLocker && mention.currentLocker.uid !== authUser.uid) {
        throw new Error("هذا الـMention قيد التنفيذ حاليًا بواسطة مستخدم آخر.");
      }

      throw new Error("هذا الـMention غير متاح للتنفيذ حاليًا.");
    }

    const lockDurationMinutes =
      Number(mention.lockDurationMinutes) ||
      DEFAULT_MENTION_LOCK_DURATION_MINUTES;

    const lockUntil = Timestamp.fromDate(
      new Date(now.toMillis() + lockDurationMinutes * 60 * 1000),
    );

    const updatedQueue = queue.map((item) => ({
      ...item,
      status: item.uid === authUser.uid ? "pending" : item.status || "pending",
    }));

    const history = [
      ...(Array.isArray(mention.history) ? mention.history : []),
      mentionHistoryEvent(
        "claimed",
        authUser.uid,
        profile.name || authUser.displayName || authUser.email || "",
        {
          claimedAt: now,
          lockUntil,
        },
      ),
    ];

    const nextCycles = Number(mention.cycles) || 0;

    transaction.update(mentionRef, {
      status: "locked",

      currentLocker: {
        uid: authUser.uid,
        name: profile.name || authUser.displayName || authUser.email || "",
      },

      lockUntil,
      lockReason: "execution",

      cycles: nextCycles + 1,

      queue: updatedQueue,

      history,
      updatedAt: now,
    });

    result = {
      ...mention,
      status: "locked",
      currentLocker: {
        uid: authUser.uid,
        name: profile.name || authUser.displayName || authUser.email || "",
      },
      lockUntil,
      cycles: nextCycles + 1,
    };
  });

  return result;
}

export async function completeMention(mentionId) {
  const authUser = requireAuth();

  const profile = await getUserById(authUser.uid);

  if (!profile) {
    throw new Error("تعذر العثور على المستخدم.");
  }

  if (profile.active === false) {
    throw new Error("الحساب غير مفعل.");
  }

  const mentionRef = doc(db, MENTIONS_COLLECTION, mentionId);

  let result = null;

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(mentionRef);

    if (!snapshot.exists()) {
      throw new Error("الـMention غير موجود.");
    }

    const mention = normalizeMention(snapshot);

    const now = Timestamp.now();
    const nowMillis = now.toMillis();

    if (isMentionExpiredInternal(mention, nowMillis)) {
      throw new Error("انتهت صلاحية هذا الـMention.");
    }

    // Only the current locker can complete the Mention.
    if (!mention.currentLocker || mention.currentLocker.uid !== authUser.uid) {
      throw new Error("أنت لا تملك الـMention حاليًا.");
    }

    const lockUntil = timestampMillis(mention.lockUntil);

    if (lockUntil === null || nowMillis >= lockUntil) {
      throw new Error("انتهى وقت التنفيذ. أصبح الـMention متاحًا من جديد.");
    }

    const queue = Array.isArray(mention.queue) ? mention.queue : [];

    const completedBy = Array.isArray(mention.completedBy)
      ? mention.completedBy
      : [];

    const participantIndex = queue.findIndex(
      (item) => item.uid === authUser.uid,
    );

    if (participantIndex === -1) {
      throw new Error(
        "أنت أكملت هذا الـMention بالفعل أو لم تعد ضمن قائمة الانتظار.",
      );
    }

    if (completedBy.some((item) => item.uid === authUser.uid)) {
      throw new Error("لقد أكملت هذا الـMention بالفعل.");
    }

    const completedEntry = {
      uid: authUser.uid,
      name: profile.name || authUser.displayName || authUser.email || "",
      completedAt: now,
    };

    const updatedQueue = queue.filter((item) => item.uid !== authUser.uid);

    const updatedCompletedBy = [...completedBy, completedEntry];

    const totalParticipants =
      Number(mention.totalParticipants) || queue.length + completedBy.length;

    const allCompleted =
      updatedCompletedBy.length >= totalParticipants &&
      updatedQueue.length === 0;

    let nextLockUntil = null;

    if (!allCompleted) {
      const lockDurationMinutes =
        Number(mention.lockDurationMinutes) ||
        DEFAULT_MENTION_LOCK_DURATION_MINUTES;

      nextLockUntil = Timestamp.fromMillis(
        nowMillis + lockDurationMinutes * 60 * 1000,
      );
    }

    const history = [
      ...(Array.isArray(mention.history) ? mention.history : []),

      mentionHistoryEvent("completed", authUser.uid, completedEntry.name, {
        completedAt: now,
      }),
    ];

    if (!allCompleted) {
      history.push(
        mentionHistoryEvent("cycle_locked", null, "System", {
          lockUntil: nextLockUntil,
        }),
      );
    }

    transaction.update(mentionRef, {
      status: allCompleted ? "completed" : "locked",

      queue: updatedQueue,

      completedBy: updatedCompletedBy,

      totalParticipants,

      totalCompleted: updatedCompletedBy.length,

      // No user owns the Mention during
      // the cycle cooldown.
      currentLocker: null,

      lockUntil: nextLockUntil,

      lockReason: allCompleted ? null : "cycle",

      history,

      updatedAt: now,
    });

    result = {
      ...mention,

      status: allCompleted ? "completed" : "locked",

      queue: updatedQueue,

      completedBy: updatedCompletedBy,

      totalParticipants,

      totalCompleted: updatedCompletedBy.length,

      currentLocker: null,

      lockUntil: nextLockUntil,

      lockReason: allCompleted ? null : "cycle",

      history,

      openNotificationSentAt: null,
    };
  });

  return result;
}

export async function reactivateMention(mentionId, extraTimeMinutes) {
  const user = requireAuth();
  const now = Timestamp.now();

  if (!mentionId) {
    throw new Error("Mention ID is required.");
  }

  const minutes = Number(extraTimeMinutes);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("Invalid reactivation duration.");
  }

  const mentionRef = doc(db, MENTIONS_COLLECTION, mentionId);

  const userRef = doc(db, USERS_COLLECTION, user.uid);

  return await runTransaction(db, async (transaction) => {
    const mentionSnapshot = await transaction.get(mentionRef);

    const userSnapshot = await transaction.get(userRef);

    if (!mentionSnapshot.exists()) {
      throw new Error("Mention not found.");
    }

    if (!userSnapshot.exists()) {
      throw new Error("User profile not found.");
    }

    const mention = mentionSnapshot.data();
    const profile = userSnapshot.data();

    // Only active admins can reactivate Mentions.
    if (profile.active === false || profile.role !== "admin") {
      throw new Error("Only active administrators can reactivate Mentions.");
    }

    const expiresAt = toDate(mention.expiresAt)?.getTime();

    if (!expiresAt || Date.now() < expiresAt) {
      throw new Error("Only expired Mentions can be reactivated.");
    }

    const queue = Array.isArray(mention.queue) ? mention.queue : [];

    const completedBy = Array.isArray(mention.completedBy)
      ? mention.completedBy
      : [];

    const totalParticipants =
      Number(mention.totalParticipants) || queue.length + completedBy.length;

    // A completed Mention must remain completed.
    if (
      totalParticipants > 0 &&
      completedBy.length >= totalParticipants &&
      queue.length === 0
    ) {
      throw new Error("A completed Mention cannot be reactivated.");
    }

    const newExpiresAt = Timestamp.fromMillis(Date.now() + minutes * 60 * 1000);

    const history = Array.isArray(mention.history) ? [...mention.history] : [];

    history.push({
      type: "reactivated",
      userId: user.uid,
      userName: profile.name || user.email || "Admin",
      timestamp: now,
      extraTimeMinutes: minutes,
    });

    transaction.update(mentionRef, {
      expiresAt: newExpiresAt,

      // Reactivation does NOT claim the Mention.
      currentLocker: null,

      lockUntil: null,

      lockReason: null,

      status: "open",

      openNotificationSentAt: null,

      reactivatedAt: now,

      history,

      updatedAt: now,
    });

    return {
      id: mentionId,
      ...mention,

      expiresAt: newExpiresAt,

      currentLocker: null,

      lockUntil: null,

      lockReason: null,

      status: "open",

      openNotificationSentAt: null,

      reactivatedAt: now,

      history,

      updatedAt: now,
    };
  });
}

// ============================================================
// MENTION SETTINGS
// ============================================================

export async function getMentionSettings() {
  requireAuth();

  const ref = doc(db, MENTION_SETTINGS_COLLECTION, MENTION_SETTINGS_DOCUMENT);

  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    return {
      defaultLockDurationMinutes: DEFAULT_MENTION_LOCK_DURATION_MINUTES,
    };
  }

  const data = snapshot.data();

  return {
    defaultLockDurationMinutes:
      Number(data.defaultLockDurationMinutes) ||
      DEFAULT_MENTION_LOCK_DURATION_MINUTES,

    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
  };
}

export async function updateMentionSettings(defaultLockDurationMinutes) {
  const authUser = requireAuth();

  const adminProfile = await getUserById(authUser.uid);

  if (!adminProfile) {
    throw new Error("تعذر العثور على المستخدم.");
  }

  if (adminProfile.active === false || adminProfile.role !== "admin") {
    throw new Error("تعديل إعدادات الـMentions متاح للأدمن فقط.");
  }

  const minutes = Number(defaultLockDurationMinutes);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("مدة الـLock يجب أن تكون أكبر من صفر.");
  }

  if (minutes > 24 * 60) {
    throw new Error("مدة الـLock لا يمكن أن تتجاوز 24 ساعة.");
  }

  const ref = doc(db, MENTION_SETTINGS_COLLECTION, MENTION_SETTINGS_DOCUMENT);

  await setDoc(
    ref,
    {
      defaultLockDurationMinutes: minutes,
      updatedAt: serverTimestamp(),
      updatedBy: authUser.uid,
      updatedByName:
        adminProfile.name || authUser.displayName || authUser.email || "",
    },
    {
      merge: true,
    },
  );

  return await getMentionSettings();
}

// ============================================================
// MENTION ANALYTICS
// ============================================================

export async function getMentionAnalytics() {
  const authUser = requireAuth();

  const profile = await getUserById(authUser.uid);

  if (!profile || profile.active === false || profile.role !== "admin") {
    throw new Error("Analytics متاحة للأدمن فقط.");
  }

  const [mentions, users] = await Promise.all([getMentions(), getUsers()]);

  const stats = {
    totalMentions: mentions.length,
    activeMentions: 0,
    openMentions: 0,
    lockedMentions: 0,
    expiredMentions: 0,
    completedMentions: 0,
    totalCreated: mentions.length,
    totalCompleted: 0,
  };

  const userStats = new Map();

  users.forEach((user) => {
    userStats.set(user.uid, {
      uid: user.uid,
      name: user.name || "Unnamed",
      role: user.role || "employee",
      createdCount: 0,
      completedCount: 0,
      pendingCount: 0,
    });
  });

  mentions.forEach((mention) => {
    const status = getMentionStatusInternal(mention);

    if (status === "expired") {
      stats.expiredMentions++;
    } else if (status === "completed") {
      stats.completedMentions++;
    } else {
      stats.activeMentions++;

      if (status === "open") {
        stats.openMentions++;
      }

      if (status === "locked") {
        stats.lockedMentions++;
      }
    }

    const completedBy = Array.isArray(mention.completedBy)
      ? mention.completedBy
      : [];

    stats.totalCompleted += completedBy.length;

    if (mention.createdBy) {
      if (!userStats.has(mention.createdBy)) {
        userStats.set(mention.createdBy, {
          uid: mention.createdBy,
          name: mention.createdByName || "Unknown",
          role: "unknown",
          createdCount: 0,
          completedCount: 0,
          pendingCount: 0,
        });
      }

      userStats.get(mention.createdBy).createdCount++;
    }

    completedBy.forEach((entry) => {
      if (!entry.uid) {
        return;
      }

      if (!userStats.has(entry.uid)) {
        userStats.set(entry.uid, {
          uid: entry.uid,
          name: entry.name || "Unknown",
          role: "unknown",
          createdCount: 0,
          completedCount: 0,
          pendingCount: 0,
        });
      }

      userStats.get(entry.uid).completedCount++;
    });

    const queue = Array.isArray(mention.queue) ? mention.queue : [];

    queue.forEach((entry) => {
      if (!entry.uid) {
        return;
      }

      if (!userStats.has(entry.uid)) {
        userStats.set(entry.uid, {
          uid: entry.uid,
          name: entry.name || "Unknown",
          role: "unknown",
          createdCount: 0,
          completedCount: 0,
          pendingCount: 0,
        });
      }

      userStats.get(entry.uid).pendingCount++;
    });
  });

  return {
    stats,
    users: Array.from(userStats.values()).sort((a, b) => {
      if (b.completedCount !== a.completedCount) {
        return b.completedCount - a.completedCount;
      }

      return b.createdCount - a.createdCount;
    }),
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

/**
 * Get the effective status of a Mention.
 *
 * Possible values:
 * - locked
 * - open
 * - expired
 * - completed
 */
export function getMentionStatus(mention, nowMs = Date.now()) {
  if (!mention) {
    return "expired";
  }

  const expiresAt = toDate(mention.expiresAt)?.getTime();
  const unlockAt = toDate(mention.unlockAt)?.getTime();
  const lockUntil = toDate(mention.lockUntil)?.getTime();

  // Expiration always has the highest priority.
  if (expiresAt && nowMs >= expiresAt) {
    return "expired";
  }

  // If everybody has completed, the Mention is completed.
  const queue = Array.isArray(mention.queue) ? mention.queue : [];
  const completedBy = Array.isArray(mention.completedBy)
    ? mention.completedBy
    : [];

  if (
    mention.totalParticipants !== undefined &&
    mention.totalParticipants > 0 &&
    completedBy.length >= mention.totalParticipants &&
    queue.length === 0
  ) {
    return "completed";
  }

  // Active execution lock or cooldown lock.
  if (lockUntil && nowMs < lockUntil) {
    return "locked";
  }

  // Initial lock after creation.
  if (unlockAt && nowMs < unlockAt) {
    return "locked";
  }

  return "open";
}

export const mentionStatus = getMentionStatus;

// ============================================================
// NOTIFICATIONS
// ============================================================

const NOTIFICATIONS_COLLECTION = "notifications";
const FCM_TOKENS_COLLECTION = "fcmTokens";

let messagingInstance = null;

/**
 * Get Firebase Messaging instance.
 */
async function getMessagingInstance() {
  const supported = await isSupported();

  if (!supported) {
    return null;
  }

  if (!messagingInstance) {
    messagingInstance = getMessaging(app);
  }

  return messagingInstance;
}

/**
 * Register the current browser for push notifications.
 *
 * Returns:
 * - token
 * - null if browser does not support FCM
 */
export async function registerPushNotifications() {
  const user = requireAuth();

  const profile = await getUserById(user.uid);

  if (!profile) {
    throw new Error("User profile not found.");
  }

  if (profile.active === false) {
    throw new Error("Your account is inactive.");
  }

  const messaging = await getMessagingInstance();

  if (!messaging) {
    return null;
  }

  // Browser permission.
  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return null;
  }

  // Service worker must already be registered.
  const registration = await navigator.serviceWorker.ready;

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    return null;
  }

  const tokenId = await sha256Hex(token);

  await setDoc(
    doc(db, FCM_TOKENS_COLLECTION, tokenId),
    {
      token,
      uid: user.uid,
      role: profile.role || null,
      userName: profile.name || user.email || "User",
      active: true,
      updatedAt: serverTimestamp(),
    },
    {
      merge: true,
    },
  );

  return token;
}

/**
 * Remove current browser FCM token.
 */
export async function unregisterPushNotifications() {
  const user = requireAuth();

  const messaging = await getMessagingInstance();

  if (!messaging) {
    return;
  }

  // We intentionally don't delete the token here.
  // The backend can simply ignore/deactivate old tokens.
  const profile = await getUserById(user.uid);

  if (!profile) {
    return;
  }
}

/**
 * Listen for notifications while the application is open.
 */
export async function listenForForegroundNotifications(callback) {
  const messaging = await getMessagingInstance();

  if (!messaging) {
    return () => {};
  }

  return onMessage(messaging, (payload) => {
    callback?.(payload);
  });
}

/**
 * Create an in-app notification.
 *
 * This is mainly used by trusted backend code later.
 * Frontend should NOT call this to notify everyone.
 */
export async function createNotification(data) {
  const notificationRef = doc(collection(db, NOTIFICATIONS_COLLECTION));

  const notification = {
    type: data.type || "general",
    title: data.title || "Notification",
    message: data.message || "",
    taskId: data.taskId || null,
    mentionId: data.mentionId || null,
    createdBy: data.createdBy || null,
    createdByName: data.createdByName || null,
    createdAt: serverTimestamp(),
  };

  await setDoc(notificationRef, notification);

  return {
    id: notificationRef.id,
    ...notification,
  };
}
