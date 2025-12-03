// src/firebase/firebase.js  (NATIVE)
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  onAuthStateChanged,
  onIdTokenChanged,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  initializeFirestore,
  getFirestore,
  collection as _collection,
  doc as _doc,
  getDoc as _getDoc,
  getDocs as _getDocs,
  query as _query,
  where as _where,
  orderBy as _orderBy,
  limit as _limit,
  startAt as _startAt,
  endAt as _endAt,
  addDoc as _addDoc,
  setDoc as _setDoc,
  updateDoc as _updateDoc,
  deleteDoc as _deleteDoc,
  onSnapshot as _onSnapshot,
  serverTimestamp as _serverTimestamp,
  FieldPath as _FieldPath,
  Timestamp as _Timestamp,
  collectionGroup as _collectionGroup,
} from "firebase/firestore";

import { getStorage } from "firebase/storage";
import { getFunctions, httpsCallable as _httpsCallable } from "firebase/functions";

/* ---- CONFIG (zostaw identyczny jak na WEB, żeby wykluczyć rozjazd) ---- */
export const firebaseConfig = {
  apiKey: "AIzaSyBWRi5UpJcw0ZOc4DxkMmUtpJNao3_VkS8",
  authDomain: "domowe-443e7.firebaseapp.com",
  projectId: "domowe-443e7",
  storageBucket: "domowe-443e7.firebasestorage.app",
  messagingSenderId: "637708982974",
  appId: "1:637708982974:web:cc623b83305de1d0e25cef",
  measurementId: "G-MV7D6Q1ZGS",
};

/* ---- APP ---- */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* ---- AUTH (RN persistence) ---- */
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // jak już zainicjalizowane (HMR) lub starsze środowisko
  authInstance = getAuth(app);
}
export const auth = authInstance;

try {
  auth.useDeviceLanguage && auth.useDeviceLanguage();
  auth.languageCode = "pl";
} catch (e) {}

/* ---- FIRESTORE ---- */
export const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    });
  } catch (e) {
    return getFirestore(app);
  }
})();

/* ---- STORAGE ---- */
export const storage = getStorage(app);

/* ---- FUNCTIONS ---- */
export const functions = getFunctions(app, "europe-central2");
export const httpsCallable = (name) => _httpsCallable(functions, name);
export const callFn = httpsCallable;

/* ===== wrappery jak w WEB (opcjonalne, ale zostawiam dla parity) ===== */
function _isDbArg(x) {
  return x === db;
}
function _assertNoSlashes(fn, segs) {
  if (segs.length === 1 && typeof segs[0] === "string" && segs[0].includes("/")) {
    throw new Error(`${fn}(): nie używaj stringów ze slashami. Użyj segmentów.`);
  }
}
function _assertParity(fn, segs, shouldBeEven) {
  const isEven = segs.length % 2 === 0;
  if (isEven !== shouldBeEven) {
    throw new Error(
      shouldBeEven ? `${fn}(): doc() musi wskazywać dokument.` : `${fn}(): collection() musi wskazywać kolekcję.`
    );
  }
}

export const collection = (...args) => {
  let segs = args;
  if (_isDbArg(args[0])) segs = args.slice(1);
  _assertNoSlashes("collection", segs);
  _assertParity("collection", segs, false);
  return _collection(db, ...segs);
};

export const doc = (...args) => {
  let segs = args;
  if (_isDbArg(args[0])) segs = args.slice(1);
  _assertNoSlashes("doc", segs);
  _assertParity("doc", segs, true);
  return _doc(db, ...segs);
};

export const collectionGroup = (groupId) => _collectionGroup(db, groupId);

/* re-exporty */
export const addDoc = _addDoc;
export const setDoc = _setDoc;
export const updateDoc = _updateDoc;
export const deleteDoc = _deleteDoc;
export const getDoc = _getDoc;
export const getDocs = _getDocs;
export const onSnapshot = _onSnapshot;

export const query = _query;
export const where = _where;
export const orderBy = _orderBy;
export const limit = _limit;
export const startAt = _startAt;
export const endAt = _endAt;

export const serverTimestamp = _serverTimestamp;
export const FieldPath = _FieldPath;
export const Timestamp = _Timestamp;

export { onAuthStateChanged, onIdTokenChanged };

export default {
  app,
  auth,
  db,
  storage,
  functions,
  httpsCallable,
  callFn,
  firebaseConfig,
  collection,
  doc,
  collectionGroup,
};
