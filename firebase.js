// ============================================================
// firebase.js
// Shared Firebase layer
// ------------------------------------------------------------
// This is the ONLY file that communicates with Firebase.
// employee.js and admin.js should use the functions exported
// from this file instead of accessing Firebase directly.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


// ============================================================
// 1. FIREBASE CONFIG
// ============================================================
//
// Replace these values with your Firebase project's config.
//
// Firebase Console
// → Project settings
// → Your apps
// → Web app
// ============================================================

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};


// ============================================================
// 2. INITIALIZE FIREBASE
// ============================================================

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


// ============================================================
// 3. COLLECTION NAMES
// ============================================================

const COLLECTIONS = {
    USERS: "users",
    TASKS: "tasks",
    ACTIVITY_LOGS: "activityLogs"
};


// ============================================================
// 4. AUTHENTICATION
// ============================================================

/**
 * Get currently authenticated Firebase user.
 */
export function getCurrentAuthUser() {
    return auth.currentUser;
}


/**
 * Listen for authentication state changes.
 *
 * callback receives:
 * - Firebase user object
 * - null if logged out
 */
export function listenToAuthState(callback) {
    return onAuthStateChanged(auth, callback);
}


/**
 * Login with email/password.
 */
export async function loginUser(email, password) {
    try {
        const result = await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        return result.user;
    } catch (error) {
        console.error("Login error:", error);
        throw error;
    }
}


/**
 * Logout current user.
 */
export async function logoutUser() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout error:", error);
        throw error;
    }
}


/**
 * Create Firebase Auth user.
 *
 * NOTE:
 * This should normally be used from the Admin side.
 * Creating another Firebase Auth user from the currently logged-in
 * browser can change the current auth session.
 *
 * For the final production admin panel, user creation is better
 * handled through a secure backend / Cloud Function.
 */
export async function registerAuthUser(email, password) {
    try {
        const result = await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

        return result.user;
    } catch (error) {
        console.error("Register user error:", error);
        throw error;
    }
}


// ============================================================
// 5. USER FUNCTIONS
// ============================================================


/**
 * Get a single user document.
 */
export async function getUser(userId) {
    if (!userId) {
        throw new Error("getUser: userId is required.");
    }

    const userRef = doc(db, COLLECTIONS.USERS, userId);

    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
        return null;
    }

    return {
        id: snapshot.id,
        ...snapshot.data()
    };
}


/**
 * Get all users.
 *
 * Admin will use this later.
 */
export async function getUsers() {
    const usersRef = collection(db, COLLECTIONS.USERS);

    const snapshot = await getDocs(usersRef);

    return snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
    }));
}


// ============================================================
// 6. TASK FUNCTIONS
// ============================================================


/**
 * Get one task by ID.
 */
export async function getTask(taskId) {
    if (!taskId) {
        throw new Error("getTask: taskId is required.");
    }

    const taskRef = doc(db, COLLECTIONS.TASKS, taskId);

    const snapshot = await getDoc(taskRef);

    if (!snapshot.exists()) {
        return null;
    }

    return {
        id: snapshot.id,
        ...snapshot.data()
    };
}


/**
 * Get all tasks assigned to a specific user.
 *
 * Employee page will mainly use this function.
 */
export async function getTasksForUser(userId) {
    if (!userId) {
        throw new Error("getTasksForUser: userId is required.");
    }

    const tasksRef = collection(db, COLLECTIONS.TASKS);

    const q = query(
        tasksRef,
        where("assignedTo", "==", userId),
        orderBy("scheduledAt", "desc")
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
    }));
}


/**
 * Get all tasks.
 *
 * Admin will use this later.
 */
export async function getAllTasks() {
    const tasksRef = collection(db, COLLECTIONS.TASKS);

    const q = query(
        tasksRef,
        orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
    }));
}


/**
 * Create a task.
 *
 * Admin will use this later.
 */
export async function createTask(taskData) {
    if (!taskData) {
        throw new Error("createTask: taskData is required.");
    }

    const tasksRef = collection(db, COLLECTIONS.TASKS);

    const task = {
        title: taskData.title ?? "",
        description: taskData.description ?? "",
        link: taskData.link ?? "",

        createdBy: taskData.createdBy ?? null,
        assignedTo: taskData.assignedTo ?? null,

        scheduledAt: taskData.scheduledAt ?? null,
        deadline: taskData.deadline ?? null,

        status: "pending",

        createdAt: serverTimestamp(),
        completedAt: null
    };

    const result = await addDoc(tasksRef, task);

    return {
        id: result.id,
        ...task
    };
}


/**
 * Mark task as completed.
 *
 * Employee can call this for his own assigned task.
 */
export async function completeTask(taskId) {
    if (!taskId) {
        throw new Error("completeTask: taskId is required.");
    }

    const currentUser = auth.currentUser;

    if (!currentUser) {
        throw new Error("User is not authenticated.");
    }

    const taskRef = doc(db, COLLECTIONS.TASKS, taskId);

    const taskSnapshot = await getDoc(taskRef);

    if (!taskSnapshot.exists()) {
        throw new Error("Task does not exist.");
    }

    const task = taskSnapshot.data();

    // Make sure this task belongs to the current user.
    if (task.assignedTo !== currentUser.uid) {
        throw new Error("You are not allowed to complete this task.");
    }

    // Prevent completing already completed tasks.
    if (task.status === "completed") {
        throw new Error("Task is already completed.");
    }

    // Check deadline on client side.
    // Firestore Security Rules should ALSO enforce this.
    if (task.deadline) {
        const deadlineDate = convertFirebaseDate(task.deadline);

        if (deadlineDate && new Date() > deadlineDate) {
            throw new Error("Task deadline has passed.");
        }
    }

    await updateDoc(taskRef, {
        status: "completed",
        completedAt: serverTimestamp()
    });

    await createActivityLog({
        type: "task_completed",
        userId: currentUser.uid,
        taskId: taskId
    });

    return true;
}


// ============================================================
// 7. ACTIVITY LOGS
// ============================================================

/**
 * Create an activity log.
 */
export async function createActivityLog(data) {
    const logsRef = collection(
        db,
        COLLECTIONS.ACTIVITY_LOGS
    );

    const log = {
        type: data.type ?? "unknown",
        userId: data.userId ?? null,
        taskId: data.taskId ?? null,
        createdAt: serverTimestamp()
    };

    const result = await addDoc(logsRef, log);

    return {
        id: result.id,
        ...log
    };
}


// ============================================================
// 8. FIREBASE DATE HELPERS
// ============================================================


/**
 * Convert Firebase Timestamp / JS Date / ISO string
 * into JavaScript Date.
 */
export function convertFirebaseDate(value) {
    if (!value) {
        return null;
    }

    // Firebase Timestamp
    if (
        typeof value === "object" &&
        typeof value.toDate === "function"
    ) {
        return value.toDate();
    }

    // JS Date
    if (value instanceof Date) {
        return value;
    }

    // Firestore Timestamp-like object
    if (
        typeof value === "object" &&
        typeof value.seconds === "number"
    ) {
        return new Date(
            value.seconds * 1000 +
            Math.floor((value.nanoseconds || 0) / 1000000)
        );
    }

    // String / number
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}


/**
 * Convert Date into Firestore Timestamp.
 */
export function toFirebaseTimestamp(date) {
    if (!date) {
        return null;
    }

    if (!(date instanceof Date)) {
        date = new Date(date);
    }

    return Timestamp.fromDate(date);
}


// ============================================================
// 9. TASK STATUS HELPER
// ============================================================

/**
 * Determine actual task status.
 *
 * This doesn't write anything to Firebase.
 */
export function calculateTaskStatus(task) {
    if (!task) {
        return "unknown";
    }

    if (task.status === "completed") {
        return "completed";
    }

    const deadline = convertFirebaseDate(task.deadline);

    if (deadline && new Date() > deadline) {
        return "expired";
    }

    return "pending";
}


// ============================================================
// 10. EXPORT FIREBASE INSTANCES
// ============================================================
//
// Usually employee.js/admin.js should NOT need these.
// They are exported only in case we need them later.
// ============================================================

export {
    app,
    auth,
    db,
    COLLECTIONS
};