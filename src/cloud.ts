import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  onAuthStateChanged,
  connectAuthEmulator,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  signInAnonymously,
  updateProfile,
  linkWithPopup,
  linkWithRedirect,
  EmailAuthProvider,
  linkWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  onSnapshot,
  query,
  limit,
  updateDoc,
} from "firebase/firestore";
import { createSparkCommand, normalize } from "./spark";
const env = import.meta.env;
// Sample records are available only for isolated local development tests.
// Published sites always use the real Firebase connection, even with ?demo=1.
export const localDemo =
  import.meta.env.DEV &&
  /^(localhost|127\.0\.0\.1)$/.test(location.hostname) &&
  new URLSearchParams(location.search).has("demo");
export const connected =
  !localDemo &&
  !!(
    env.VITE_FIREBASE_API_KEY &&
    env.VITE_FIREBASE_PROJECT_ID &&
    env.VITE_FIREBASE_APP_ID &&
    env.VITE_FIREBASE_AUTH_DOMAIN
  );
const app = connected
  ? initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    })
  : null;
const auth = app
  ? initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  : null;
export const db = app ? getFirestore(app) : null;
if (import.meta.env.DEV && env.VITE_USE_EMULATORS === "true" && auth && db) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
if (auth) auth.languageCode = "ko";
const googleProvider = new GoogleAuthProvider();
// Restore the saved account first; ask Google only on an explicit login action.
// Browsers that block popups can use the redirect flow.
export const login = async () => {
  if (!auth)
    throw Error(
      "Firebase 연결 후 Google 로그인을 사용할 수 있어요. 지금은 체험 모드예요.",
    );
  try {
    if (auth.currentUser?.isAnonymous)
      return await linkWithPopup(auth.currentUser, googleProvider);
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (
      code === "auth/popup-blocked" ||
      code === "auth/cancelled-popup-request"
    ) {
      if (auth.currentUser?.isAnonymous)
        await linkWithRedirect(auth.currentUser, googleProvider);
      else await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
};
export const sessionUser = () => auth?.currentUser || null;
export async function guestLogin(name: string) {
  if (!auth) throw Error("실제 참여는 서버 연결이 필요해요.");
  if (!name.trim() || name.trim().length > 40)
    throw Error("별명을 1~40자로 적어 주세요.");
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  if (auth.currentUser?.isAnonymous)
    await updateProfile(auth.currentUser, { displayName: name.trim() });
  await command("bootstrap");
  if (auth.currentUser?.isAnonymous)
    await updateDoc(doc(db!, "profiles", auth.currentUser.uid), {
      name: name.trim(),
    });
}
export async function emailLogin(
  email: string,
  password: string,
  create = false,
) {
  if (!auth) throw Error("서버 연결이 필요해요.");
  if (password.length < 8)
    throw Error("계정 비밀번호는 8자 이상으로 정해 주세요.");
  if (auth.currentUser?.isAnonymous) {
    await linkWithCredential(
      auth.currentUser,
      EmailAuthProvider.credential(email.trim(), password),
    );
  } else if (create)
    await createUserWithEmailAndPassword(auth, email.trim(), password);
  else await signInWithEmailAndPassword(auth, email.trim(), password);
}
export async function resetEmailAccount(email: string) {
  if (!auth || !email.trim()) throw Error("가입한 이메일을 입력해 주세요.");
  await sendPasswordResetEmail(auth, email.trim());
}
export const logout = () => (auth ? signOut(auth) : Promise.resolve());
export const watchAuth = (fn: Parameters<typeof onAuthStateChanged>[1]) =>
  auth ? onAuthStateChanged(auth, fn) : () => {};
export async function command(
  action: string,
  payload: Record<string, unknown> = {},
) {
  if (!db || !auth?.currentUser)
    throw Error("Google 로그인과 Firebase 연결이 필요해요.");
  return createSparkCommand(
    db,
    auth.currentUser.uid,
    auth.currentUser.displayName || "모험가",
  )(
    action,
    action === "bootstrap"
      ? {
          ...payload,
          accountKind: auth.currentUser.isAnonymous ? "guest" : "permanent",
        }
      : payload,
  );
}
export function watchDoc(
  path: string,
  fn: (data: any) => void,
  error: (e: Error) => void,
) {
  return db
    ? onSnapshot(
        doc(db, path),
        (s) => fn(s.exists() ? normalize(s.data()) : null),
        error,
      )
    : () => {};
}
export function watchList(
  path: string,
  fn: (data: any[]) => void,
  error: (e: Error) => void,
) {
  return db
    ? onSnapshot(
        query(collection(db, path), limit(100)),
        (s) => fn(s.docs.map((d) => ({ ...normalize(d.data()), id: d.id }))),
        error,
      )
    : () => {};
}
