/**
 * Nhận giọng nói tiếng Việt bằng Web Speech API có sẵn của trình duyệt.
 * Chrome/Edge gửi âm thanh lên Google để nhận dạng; Safari dùng dịch vụ của Apple.
 */
export const useSpeech = () => {
  interface ResultLike {
    isFinal: boolean;
    0: { transcript: string };
    length: number;
  }
  interface SpeechRecognitionLike {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onaudiostart: (() => void) | null;
    onspeechstart: (() => void) | null;
    onresult: ((event: { resultIndex: number; results: ArrayLike<ResultLike> }) => void) | null;
    onerror: ((event: { error: string; message?: string }) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
  }
  type RecognitionCtor = new () => SpeechRecognitionLike;

  const getCtor = (): RecognitionCtor | null => {
    if (!import.meta.client) return null;
    const w = window as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  };

  const supported = ref(false);
  const listening = ref(false);
  /** Lời đang nhận được (kể cả tạm thời) để hiện lên ô nhập ngay khi nói */
  const interim = ref("");
  let recognition: SpeechRecognitionLike | null = null;

  onMounted(() => {
    supported.value = getCtor() !== null;
  });

  const ERROR_MESSAGES: Record<string, string> = {
    "not-allowed": "Trình duyệt chưa được phép dùng micro. Kiểm tra quyền của trang và quyền micro của trình duyệt trong cài đặt hệ điều hành.",
    "service-not-allowed": "Dịch vụ nhận giọng nói bị tắt. Trên macOS/iOS cần bật Siri hoặc Đọc chính tả (Dictation).",
    "audio-capture": "Không tìm thấy micro. Kiểm tra thiết bị đầu vào âm thanh.",
    network: "Nhận giọng nói cần kết nối mạng.",
    aborted: "Đã hủy.",
  };

  /**
   * Nghe một câu rồi trả về chuỗi. Trả về "" nếu không nghe thấy gì (no-speech),
   * chỉ ném lỗi với các sự cố thật sự (quyền, thiết bị, mạng).
   */
  const listenOnce = () =>
    new Promise<string>((resolve, reject) => {
      const Ctor = getCtor();
      if (!Ctor) return reject(new Error("Trình duyệt không hỗ trợ nhận giọng nói"));

      recognition?.abort();
      recognition = new Ctor();
      recognition.lang = "vi-VN";
      recognition.continuous = false;
      // Lấy cả kết quả tạm thời: nếu phiên kết thúc trước khi có kết quả cuối, vẫn giữ được lời đã nói
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let finalText = "";
      let interimText = "";
      let failure: Error | null = null;

      recognition.onaudiostart = () => console.debug("[speech] đang thu âm");
      recognition.onspeechstart = () => console.debug("[speech] phát hiện giọng nói");

      recognition.onresult = (event) => {
        finalText = "";
        interimText = "";
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result) continue;
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) finalText += transcript;
          else interimText += transcript;
        }
        interim.value = (finalText + interimText).trim();
      };

      recognition.onerror = (event) => {
        console.warn("[speech] error", event.error, event.message ?? "");
        // no-speech: hết thời gian chờ mà không nghe thấy gì → không phải lỗi, trả về rỗng
        if (event.error === "no-speech") return;
        failure = new Error(ERROR_MESSAGES[event.error] ?? `Lỗi micro: ${event.error}`);
      };

      recognition.onend = () => {
        listening.value = false;
        const text = (finalText || interimText).trim();
        interim.value = "";
        if (failure && !text) return reject(failure);
        resolve(text);
      };

      listening.value = true;
      interim.value = "";
      try {
        recognition.start();
      } catch (error) {
        listening.value = false;
        reject(error);
      }
    });

  const stop = () => recognition?.stop();

  onBeforeUnmount(() => recognition?.abort());

  return { supported, listening, interim, listenOnce, stop };
};
