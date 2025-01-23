// composables/useDatabase.ts
import { collection, addDoc, doc, updateDoc, getDocs, deleteDoc, query, where } from "firebase/firestore";
import { firestore } from "~/plugins/firebase.client";

export const addRecord = async (data: Record<string, any>) => {
  try {
    const docRef = await addDoc(collection(firestore, "Tasks"), data);
    return docRef.id;
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
};

export const updateRecord = async (collectionName: string, docId: string, data: Record<string, any>) => {
  try {
    const docRef = doc(firestore, collectionName, docId);
    await updateDoc(docRef, data);
  } catch (e) {
    console.error("Error updating document: ", e);
    throw e;
  }
};

export const getRecords = async (collectionName: string) => {
  try {
    const querySnapshot = await getDocs(collection(firestore, collectionName));
    const records: Record<string, any>[] = [];
    querySnapshot.forEach((doc) => {
      records.push({ id: doc.id, ...doc.data() });
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
  // Lấy tham chiếu đến collection
  const collectionRef = collection(firestore, collectionName);

  try {
    // Lấy tất cả các document trong collection
    const querySnapshot = await getDocs(collectionRef);

    // Duyệt qua từng document và xóa
    querySnapshot.forEach(async (docSnap) => {
      await deleteDoc(doc(firestore, collectionName, docSnap.id));
    });
  } catch (error) {
    console.error("Error deleting documents: ", error);
  }
};