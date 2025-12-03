    // src/firebase/firebase.web.js
    // Firebase WEB – pełny adapter zgodny z Twoją starą appką (RN parity)

    import { initializeApp, getApps, getApp } from "firebase/app";
    import {
      getAuth,
      initializeAuth,
      onAuthStateChanged,
      onIdTokenChanged,
      getReactNativePersistence,
    } from "firebase/auth";

    import {
      initializeFirestore,
      getFirestore,
      persistentLocalCache,
      persistentMultipleTabManager,
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

    import {
      getFunctions,
      httpsCallable as _httpsCallable,
    } from "firebase/functions";

    /* ---- NOWA KONFIGURACJA ---- */
    export const firebaseWebConfig = {
      apiKey: "AIzaSyBWRi5UpJcw0ZOc4DxkMmUtpJNao3_VkS8",
      authDomain: "domowe-443e7.firebaseapp.com",
      projectId: "domowe-443e7",
      storageBucket: "domowe-443e7.firebasestorage.app",
      messagingSenderId: "637708982974",
      appId: "1:637708982974:web:cc623b83305de1d0e25cef",
      measurementId: "G-MV7D6Q1ZGS"
    };

    /* ---- APP ---- */
    export const app = getApps().length ? getApp() : initializeApp(firebaseWebConfig);

    /* ---- Globalne udostępnienie projectId (REST autodetection) ---- */
    try {
      if (typeof window !== "undefined") {
        window.__FIREBASE_DEFAULT_PROJECT_ID__ = firebaseWebConfig.projectId;
      } else if (typeof globalThis !== "undefined") {
        globalThis.__FIREBASE_DEFAULT_PROJECT_ID__ =
          firebaseWebConfig.projectId;
      }
    } catch {}

    /* ---- AUTH (z persystencją dla Expo Go, jeśli RN-Web) ---- */
    const IS_REACT_NATIVE =
      typeof navigator !== "undefined" && navigator.product === "ReactNative";

    let authInstance;

    if (IS_REACT_NATIVE) {
      let AsyncStorage;
      try {
        AsyncStorage =
          require("@react-native-async-storage/async-storage").default;
      } catch {
        AsyncStorage = undefined;
      }

      try {
        authInstance = initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
      } catch {
        authInstance = getAuth(app);
      }
    } else {
      authInstance = getAuth(app);
    }

    export const auth = authInstance;

    try {
      auth.useDeviceLanguage?.();
      auth.languageCode = "pl";
    } catch {}

    /* ---- FIRESTORE ---- */
    export const db = (() => {
      try {
        return initializeFirestore(app, {
          experimentalForceLongPolling: true,
          useFetchStreams: false,
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch {
        return getFirestore(app);
      }
    })();

    /* ---- STORAGE ---- */
    export const storage = getStorage(app);

    /* ---- FUNCTIONS ---- */
    export const functions = getFunctions(app, "europe-central2");

    export const httpsCallable = (name) => _httpsCallable(functions, name);
    export const callFn = httpsCallable;

    /* ========= Starannie odtworzone helpery z Twojej apki ========= */
    function _isDbArg(x) {
      return x === db;
    }
    function _assertNoSlashes(fn, segs) {
      if (
        segs.length === 1 &&
        typeof segs[0] === "string" &&
        segs[0].includes("/")
      ) {
        throw new Error(
          `${fn}(): nie używaj stringów ze slashami. Użyj segmentów, np. ${fn}('users', uid, 'posts').`
        );
      }
    }
    function _assertParity(fn, segs, shouldBeEven) {
      const isEven = segs.length % 2 === 0;
      if (isEven !== shouldBeEven) {
        throw new Error(
          shouldBeEven
            ? `${fn}(): doc() musi wskazywać dokument.`
            : `${fn}(): collection() musi wskazywać kolekcję.`
        );
      }
    }

    /* ---- API kompatybilne z RN ---- */
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

    export const collectionGroup = (groupId) =>
      _collectionGroup(db, groupId);

    /* Re-exports Firestore API */
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

    /* ---- UTIL: zapis wyniku (jak w starej apce) ---- */
    export async function saveResultToFirebase(
      userId,
      resultLabel,
      valuePln = null
    ) {
      if (!userId) throw new Error("saveResultToFirebase: missing userId");

      await _addDoc(collection("rouletteResults"), {
        userId,
        result: resultLabel,
        valuePln,
        redeemed: false,
        timestamp: _serverTimestamp(),
      });
    }

    export { onAuthStateChanged, onIdTokenChanged };

    /* ---- Default export (jak w poprzedniej apce) ---- */
    export default {
      app,
      auth,
      db,
      storage,
      functions,
      httpsCallable,
      callFn,
      firebaseWebConfig,
      collection,
      doc,
      collectionGroup,
      addDoc,
      setDoc,
      updateDoc,
      deleteDoc,
      getDoc,
      getDocs,
      onSnapshot,
      query,
      where,
      orderBy,
      limit,
      startAt,
      endAt,
      serverTimestamp,
      FieldPath,
      Timestamp,
      saveResultToFirebase,
      onAuthStateChanged,
      onIdTokenChanged,
    };
