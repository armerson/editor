import { initializeApp } from "firebase/app"
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { getAnalytics } from "firebase/analytics"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

// Precise runtime env debugging
// These logs let us see exactly what Vite injected at build time.
// They will appear once in the browser console on first import.
// NOTE: These are for local debugging; do not ship them to production as-is.
// If you do, be aware they will expose your Firebase client config in DevTools.
// (Firebase client config is generally safe to expose.)
// Env values:
//  - apiKey, projectId, storageBucket are required for Storage to work.
console.log("[firebase] env apiKey =", import.meta.env.VITE_FIREBASE_API_KEY)
console.log("[firebase] env projectId =", import.meta.env.VITE_FIREBASE_PROJECT_ID)
console.log("[firebase] env storageBucket =", import.meta.env.VITE_FIREBASE_STORAGE_BUCKET)
console.log("[firebase] config object =", firebaseConfig)

/** True if all required Firebase config env vars are set. */
export function isFirebaseConfigured(): boolean {
  const apiKeyOk = !!firebaseConfig.apiKey
  const projectIdOk = !!firebaseConfig.projectId
  const storageBucketOk = !!firebaseConfig.storageBucket

  console.log("[firebase] apiKey ok =", apiKeyOk)
  console.log("[firebase] projectId ok =", projectIdOk)
  console.log("[firebase] storageBucket ok =", storageBucketOk)

  const ok = apiKeyOk && projectIdOk && storageBucketOk
  console.log("[firebase] isConfigured =", ok)
  return ok
}

let app: ReturnType<typeof initializeApp> | null = null
let storage: ReturnType<typeof getStorage> | null = null

function getFirebaseStorage(): ReturnType<typeof getStorage> {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Set VITE_FIREBASE_* env variables.")
  }

  if (!app) {
    app = initializeApp(firebaseConfig)

    if (firebaseConfig.measurementId && typeof window !== "undefined") {
      try {
        getAnalytics(app)
      } catch {
        // Ignore analytics errors in local/dev environments
      }
    }
  }

  if (!storage) {
    storage = getStorage(app)
  }

  return storage
}

/**
 * Upload a file to Firebase Storage and return its download URL.
 * Path will be: media/{type}/{uniqueId}_{sanitizedFileName}
 */
export async function uploadMediaToStorage(
  type: "clips" | "music" | "badge",
  file: File,
  uniqueId: string
): Promise<string> {
  const s = getFirebaseStorage()


  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const path = `media/${type}/${uniqueId}_${safeName}`
  const storageRef = ref(s, path)

  await uploadBytes(storageRef, file, {
    contentType: file.type || undefined,
  })

  return getDownloadURL(storageRef)
}