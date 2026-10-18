/** Trạng thái mạng của trình duyệt, dùng cho banner ngoại tuyến và hàng đợi ảnh. */
export const useOnline = () => {
  const online = useState<boolean>("net:online", () => true);
  const bind = () => {
    if (!import.meta.client) return () => {};
    const update = () => (online.value = navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  };
  return { online, bind };
};
