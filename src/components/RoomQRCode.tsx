"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Maximize2, QrCode, X } from "lucide-react";
import { roomJoinUrl } from "@/lib/room-link";

export default function RoomQRCode({pin, title}: {pin: string; title: string}) {
  const [url, setUrl] = useState(''), [png, setPng] = useState('');
  const [error, setError] = useState(''), [expanded, setExpanded] = useState(false), [copied, setCopied] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true;
    const link = roomJoinUrl(location.origin, pin);
    setUrl(link); setPng(''); setError('');
    import('qrcode').then(qr => qr.default.toDataURL(link, {
      width: 768, margin: 4, errorCorrectionLevel: 'Q', color: {dark: '#000000', light: '#ffffff'},
    })).then(image => { if(active) setPng(image); }).catch(() => {
      if(active) setError('สร้าง QR ไม่สำเร็จ กรุณาใช้ลิงก์หรือรหัสห้องด้านล่าง');
    });
    return () => { active = false; };
  }, [pin]);
  useEffect(() => {
    if (!expanded) return;
    closeButton.current?.focus();
    const escape = (e: KeyboardEvent) => { if(e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); expandButton.current?.focus(); };
  }, [expanded]);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกลิงก์ด้านล่าง'); } };
  const picture = png ? <img src={png} width={768} height={768} alt={`QR Code เข้าห้อง ${pin}`} /> : <span role="status">{error || 'กำลังสร้าง QR Code...'}</span>;
  const actions = <div className="qr-actions"><button type="button" className="btn light" onClick={copy} disabled={!url}>{copied?<Check size={17}/>:<Copy size={17}/>}คัดลอกลิงก์</button>{png&&<a className="btn primary" href={png} download={`CoastalQuest-Room-${pin}.png`}><Download size={17}/>ดาวน์โหลด QR</a>}</div>;
  return <>
    <section className="room-qr-card" aria-label="แชร์ QR Code เข้าห้องเรียน">
      <button type="button" className="qr-thumbnail" disabled={!png} onClick={()=>setExpanded(true)} aria-label="ขยาย QR Code เข้าห้อง">{picture}</button>
      <div className="qr-copy"><span className="overline">SCAN & JOIN</span><h3><QrCode size={20}/>สแกนเพื่อเข้าห้องเรียน</h3><p>นักเรียนสแกนด้วยกล้อง แล้วกรอกชื่อเล่นได้เลย</p><span className="qr-room-link">{url}</span>{actions}{error&&<p role="alert">{error}</p>}</div>
      <button ref={expandButton} type="button" className="btn light qr-expand" disabled={!png} onClick={()=>setExpanded(true)}><Maximize2 size={17}/>แสดงขึ้นจอ</button>
    </section>
    {expanded&&<div className="modal-shade qr-shade" onMouseDown={e=>{if(e.target===e.currentTarget)setExpanded(false);}}><section className="modal qr-modal" role="dialog" aria-modal="true" aria-label="สแกน QR Code เข้าห้องเรียน" onKeyDown={e=>{
      if(e.key!=='Tab')return;
      const targets=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]'));
      const first=targets[0],last=targets[targets.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }}><button ref={closeButton} className="close" onClick={()=>setExpanded(false)} aria-label="ปิด QR Code"><X size={24}/></button><span className="overline">COASTAL QUEST CLASSROOM</span><h2>สแกนแล้วเข้าห้องได้เลย</h2><p>{title}</p><div className="qr-large">{picture}</div><b className="qr-pin">{pin}</b><p>เปิดกล้อง สแกน QR แล้วกรอกชื่อเล่น</p>{actions}<span className="qr-room-link">{url}</span>{error&&<p role="alert">{error}</p>}</section></div>}
  </>;
}

