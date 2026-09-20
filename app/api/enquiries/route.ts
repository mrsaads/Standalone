import { saveEnquiry } from "@/lib/enquiry";

const headers={"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"};
function json(body: unknown, status: number) { return Response.json(body,{status,headers}); }
export async function POST(request: Request) {
  const origin=request.headers.get("origin");
  if(origin && origin !== new URL(request.url).origin) return json({error:"Please submit this enquiry from the audit page."},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({error:"Invalid enquiry format."},415);
  if(!request.body) return json({error:"Please complete your enquiry."},400);
  let input: unknown;
  try {
    const reader=request.body.getReader(); let size=0; const chunks: Uint8Array[]=[];
    while(true){ const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>32768){await reader.cancel();return json({error:"Your enquiry is too long. Please shorten the profile text."},413);} chunks.push(value); }
    const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    input=JSON.parse(new TextDecoder().decode(bytes));
  } catch { return json({error:"Your enquiry could not be read. Please try again."},400); }
  try { const result=await saveEnquiry(input); return json(result.body,result.status); }
  catch (error) { console.error("Enquiry storage failure", error instanceof Error ? error.name : "UnknownError"); return json({error:"Your enquiry could not be saved right now. Your answers are still here; please try again."},503); }
}
