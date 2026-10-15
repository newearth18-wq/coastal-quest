import { useEffect, useRef, useState } from "react";
import { Check, CircleHelp, LoaderCircle, Trophy, X } from "lucide-react";

export type StudentQuestion = { id: string; position: number; prompt: string; options: string[] };
export type AnswerResult = { correct: boolean; correctIndex: number; explanation: string; reward: { ammo: number; energy: number; item?: string } };

type Props = {
  initialQuestion: StudentQuestion | null;
  questionCount: number;
  roomStatus: string;
  submit: (question: StudentQuestion, choice: number) => Promise<AnswerResult>;
  next: () => Promise<StudentQuestion | null>;
  close: () => void;
};

/** Keeps feedback on screen for three seconds, independently of room broadcasts. */
export default function QuizDialog({ initialQuestion, questionCount, roomStatus, submit, next, close }: Props) {
  const [question, setQuestion] = useState(initialQuestion);
  const [choice, setChoice] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(3);
  const [advancing, setAdvancing] = useState(false);
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const submitting = useRef(false);
  const nextRef = useRef(next);
  nextRef.current = next;

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>(".quiz-close")?.focus();
    return () => {
      mounted.current = false;
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    const deadline = Date.now() + 3000;
    setSeconds(3);
    feedback.current?.scrollIntoView({ block: "nearest" });
    const ticker = window.setInterval(() => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 100);
    const timer = window.setTimeout(async () => {
      clearInterval(ticker);
      setSeconds(0);
      setAdvancing(true);
      try {
        const upcoming = await nextRef.current();
        if (cancelled) return;
        setQuestion(upcoming);
        setChoice(null);
        setResult(null);
        setError("");
        dialog.current?.querySelector<HTMLElement>(".quiz-prompt, .quiz-complete")?.focus();
        dialog.current?.querySelector(".quiz-body")?.scrollTo(0, 0);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setAdvancing(false);
      }
    }, 3000);
    return () => { cancelled = true; clearTimeout(timer); clearInterval(ticker); };
  }, [result, retry]);

  const answer = async () => {
    if (!question || choice === null || submitting.current || result || roomStatus !== "playing") return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await submit(question, choice);
      if (mounted.current) setResult(response);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <div className="modal-shade quiz-shade">
    <section ref={dialog} className="quiz-dialog" role="dialog" aria-modal="true" aria-labelledby="quiz-title" onKeyDown={e => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      if (e.key !== "Tab") return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']") ?? []);
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }}>
      <header className="quiz-header"><div><span className="overline">ตอบเพื่อเติมพลัง</span><h2 id="quiz-title">{question ? `คำถาม ${question.position + 1} / ${questionCount}` : roomStatus === "finished" ? "จบกิจกรรมแล้ว" : "ตอบครบแล้ว!"}</h2></div><button className="quiz-close" onClick={close} aria-label="ออกจากการตอบคำถาม"><X size={24}/></button></header>
      <div className="quiz-body">
        {question ? <><h3 className="quiz-prompt" tabIndex={-1}>{question.prompt}</h3><div className="quiz-options" role="group" aria-label="ตัวเลือกคำตอบ">{question.options.map((option, i) => <button key={i} disabled={busy || !!result || roomStatus !== "playing"} aria-pressed={choice === i} className={`${choice === i ? "picked" : ""} ${result && i === result.correctIndex ? "answer-correct" : ""} ${result && !result.correct && choice === i ? "answer-wrong" : ""}`} onClick={() => setChoice(i)}><span>{"ABCD"[i]}</span><span className="option-text">{option}</span>{result && i === result.correctIndex && <Check size={20}/>}</button>)}</div>
          {result && <div ref={feedback} className={`answer-feedback ${result.correct ? "success" : "retry"}`} role="status"><b>{result.correct ? "ถูกต้อง! ได้รับเสบียงแล้ว" : "มาทบทวนคำตอบกัน"}</b><p className="correct-answer">เฉลย {"ABCD"[result.correctIndex]} · {question.options[result.correctIndex]}</p>{result.explanation && <p>{result.explanation}</p>}{result.correct && <span>+{result.reward.ammo} กระสุน · +{result.reward.energy} พลัง {result.reward.item && "· +1 โล่"}</span>}</div>}
        </> : <div className="quiz-complete" tabIndex={-1}><Trophy size={52}/><h3>{roomStatus === "finished" ? "ขอบคุณที่ร่วมภารกิจ" : "เก็บครบทุกความรู้แล้ว"}</h3><p>คะแนนและเสบียงถูกบันทึกแล้ว<br/>กลับไปผจญภัย หรือดูอันดับของห้องได้เลย</p></div>}
        {error && <p className="quiz-error" role="alert"><CircleHelp size={18}/>{error}</p>}
      </div>
      <footer className="quiz-footer">{question ? result ? <><span className="quiz-countdown" role="status">{advancing ? "กำลังเปิดข้อถัดไป..." : error ? "เปิดข้อถัดไปไม่สำเร็จ" : `ข้อถัดไปใน ${seconds} วินาที`}</span>{error && <button className="btn light" onClick={() => { setError(""); setRetry(n => n + 1); }}>ลองอีกครั้ง</button>}</> : <><p>{roomStatus === "paused" ? "คุณครูหยุดกิจกรรมชั่วคราว" : roomStatus !== "playing" ? "กิจกรรมสิ้นสุดแล้ว" : "เลือกคำตอบ แล้วกดยืนยัน"}</p><button className="btn primary" disabled={busy || choice === null || roomStatus !== "playing"} onClick={answer}>{busy ? <LoaderCircle className="spin" size={18}/> : <Check size={18}/>} {busy ? "กำลังตรวจ..." : "ยืนยันคำตอบ"}</button></> : <button className="btn primary full" onClick={close}>กลับสู่ภารกิจ</button>}</footer>
    </section>
  </div>;
}
