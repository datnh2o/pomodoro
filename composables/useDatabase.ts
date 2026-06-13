// composables/useDatabase.ts
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { firestore, auth } from "~/plugins/firebase.client";

const COLLECTION = "Tasks";

const requireUid = (): string => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("User is not authenticated");
  }
  return uid;
};

export const addRecord = async (data: Record<string, any>) => {
  const userId = requireUid();
  try {
    const docRef = await addDoc(collection(firestore, COLLECTION), {
      ...data,
      userId,
      createdAt: Date.now(),
    });
    return docRef.id;
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
};

export const updateRecord = async (
  collectionName: string,
  docId: string,
  data: Record<string, any>
) => {
  try {
    const docRef = doc(firestore, collectionName, docId);
    await updateDoc(docRef, data);
  } catch (e) {
    console.error("Error updating document: ", e);
    throw e;
  }
};

export const getRecords = async (collectionName: string) => {
  const userId = requireUid();
  try {
    const q = query(
      collection(firestore, collectionName),
      where("userId", "==", userId)
    );
    const querySnapshot = await getDocs(q);
    const records: Record<string, any>[] = [];
    querySnapshot.forEach((docSnap) => {
      records.push({ id: docSnap.id, ...docSnap.data() });
    });
    return records;
  } catch (e) {
    console.error("Error getting documents: ", e);
    throw e;
  }
};

export const deleteRecord = async (collectionName: string, docId: string) => {
  try {
    const docRef = doc(firestore, collectionName, docId);
    await deleteDoc(docRef);
  } catch (e) {
    console.error("Error deleting document: ", e);
    throw e;
  }
};

export const deleteCollection = async (collectionName: string) => {
  const userId = requireUid();
  try {
    // Chỉ xóa các document thuộc về người dùng hiện tại
    const q = query(
      collection(firestore, collectionName),
      where("userId", "==", userId)
    );
    const querySnapshot = await getDocs(q);

    // Dùng batch để xóa nguyên tử và đảm bảo chờ hoàn tất
    const batch = writeBatch(firestore);
    querySnapshot.forEach((docSnap) => {
      batch.delete(doc(firestore, collectionName, docSnap.id));
    });
    await batch.commit();
  } catch (error) {
    console.error("Error deleting documents: ", error);
    throw error;
  }
};
