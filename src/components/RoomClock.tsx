import {useEffect,useState} from 'react';
export default function RoomClock({remaining,status}:{remaining:number;status:string}){
  const [seconds,setSeconds]=useState(remaining);
  useEffect(()=>{
    const received=Date.now();setSeconds(remaining);
    if(status!=='playing')return;
    const timer=setInterval(()=>setSeconds(Math.max(0,remaining-Math.floor((Date.now()-received)/1000))),250);
    return()=>clearInterval(timer);
  },[remaining,status]);
  return <>{Math.floor(seconds/60).toString().padStart(2,'0')}:{(seconds%60).toString().padStart(2,'0')}</>;
}
