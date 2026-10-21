import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { getFirestore, collection, doc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
const env = import.meta.env;
export const connected = !!(
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
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
export const login = () =>
  auth
    ? signInWithPopup(auth, new GoogleAuthProvider())
    : Promise.reject(
        Error(
          "Firebase 연결 후 Google 로그인을 사용할 수 있어요. 지금은 체험 모드예요.",
        ),
      );
export const logout = () => (auth ? signOut(auth) : Promise.resolve());
export const watchAuth = (fn: Parameters<typeof onAuthStateChanged>[1]) =>
  auth ? onAuthStateChanged(auth, fn) : () => {};
export async function command(
  action: string,
  payload: Record<string, unknown> = {},
) {
  if (!app) throw Error("서버 연결이 필요해요.");
  const call = httpsCallable(getFunctions(app, "asia-northeast3"), "garden");
  return (await call({ action, ...payload })).data as any;
}
export function watchDoc(
  path: string,
  fn: (data: any) => void,
  error: (e: Error) => void,
) {
  return db
    ? onSnapshot(doc(db, path), (s) => fn(s.exists() ? s.data() : null), error)
    : () => {};
}
export function watchList(
  path: string,
  fn: (data: any[]) => void,
  error: (e: Error) => void,
) {
  return db
    ? onSnapshot(
        collection(db, path),
        (s) => fn(s.docs.map((d) => ({ ...d.data(), id: d.id }))),
        error,
      )
    : () => {};
}
