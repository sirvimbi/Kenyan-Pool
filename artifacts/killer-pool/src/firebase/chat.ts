import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "./config";

export interface ChatMessage {
  id: string;
  uid: string;
  name: string;
  text: string;
  timestamp: any;
}

const CHATS = "chats";

export async function sendMessage(roomId: string, uid: string, name: string, text: string) {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  const messagesRef = collection(db, CHATS, roomId, "messages");
  await addDoc(messagesRef, {
    uid,
    name,
    text,
    timestamp: serverTimestamp(),
  });
}

export function subscribeMessages(
  roomId: string,
  cb: (messages: ChatMessage[]) => void
): Unsubscribe {
  if (!isFirebaseConfigured) return () => {};
  const db = getDb();
  const messagesRef = collection(db, CHATS, roomId, "messages");
  const q = query(messagesRef, orderBy("timestamp", "asc"), limit(50));

  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as ChatMessage[];
    cb(msgs);
  });
}
