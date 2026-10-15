import type { Quiz } from "./demo";
export function parseQuizCsv(input:string):Quiz[]{
 const rows:string[][]=[];let row:string[]=[],field="",quoted=false;input=input.replace(/^\uFEFF/,"");
 for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===","&&!quoted){row.push(field);field="";}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&input[i+1]==="\n")i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field="";}else field+=c;}
 if(quoted)throw new Error("CSV มีเครื่องหมายคำพูดปิดไม่ครบ");row.push(field);if(row.some(Boolean))rows.push(row);
 const header=rows.shift()?.map(h=>h.trim()),keys=["question","optionA","optionB","optionC","optionD","correctAnswer","explanation"];
 if(!header||keys.some(k=>!header.includes(k)))throw new Error("หัวตารางต้องมี "+keys.join(", "));
 return rows.map((r,i)=>{const value=(key:string)=>r[header.indexOf(key)]?.trim()??"";const correct="ABCD".indexOf(value("correctAnswer").toUpperCase());if(correct<0)throw new Error(`แถว ${i+2}: คำตอบต้องเป็น A, B, C หรือ D`);return {prompt:value("question"),options:keys.slice(1,5).map(value),correct,explanation:value("explanation")};});
}

