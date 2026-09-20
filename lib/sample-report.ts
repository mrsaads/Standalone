import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { AlignmentType, BorderStyle, Document, Footer, Header, PageNumber, Packer, Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } from "docx";
import type { AuditReport } from "./audit-report";
import { canonicalOrder, sampleAuditReport, scoreDetail, scoreHeadline, sections, summarize } from "./audit-preview";

// See docs/audit-report-template.md for the full content/layout template these two exporters implement.
// Both must render the same AuditReport content in the same order; neither should hardcode a fixed
// page count or truncate content to fit one, since a real client's findings text will vary in length.

const clean = (value: string) => value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
const navy = rgb(.075,.11,.19), green = rgb(.08,.43,.2), amber = rgb(.58,.36,.04), red = rgb(.66,.12,.12), gray = rgb(.35,.38,.42);

function wrap(text: string, font: PDFFont, size: number, width: number, maxLines = 999) {
  const lines: string[] = []; let line = "";
  for (const word of clean(text).split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; if (lines.length === maxLines) break; } else line = next; }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && clean(text).length > lines.join(" ").length) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:]?$/, "")}...`;
  return lines;
}

export async function createAuditPdf(report: AuditReport) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.TimesRoman), bold = await doc.embedFont(StandardFonts.TimesRomanBold), italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const W=612,H=792,M=44,contentW=W-M*2,TOP=746,BOTTOM=58;
  const findings = canonicalOrder(report.findings);
  const score = summarize(findings);
  let page!:PDFPage; let y=0;

  // Every block below checks remaining space with ensure()/newPageIfNeeded() before drawing, instead of
  // assuming a fixed 3-page script. That is what lets one template hold up for a client with much more
  // or much less findings text than the reference report.
  const newPage=()=>{page=doc.addPage([W,H]);y=TOP;page.drawText("IMPROVEXUS · CONFIDENTIAL PROFILE AUDIT",{x:190,y:770,font:bold,size:6.2,color:rgb(.48,.5,.53)});page.drawText("IMPROVEXUS",{x:112,y:330,font:bold,size:70,color:rgb(.91,.92,.93),rotate:degrees(32),opacity:.5});};
  const ensure=(h:number)=>{if(y-h<BOTTOM)newPage();};
  const heading=(text:string,size:number,dropAfter:number)=>{ensure(size+dropAfter+14);page.drawText(clean(text),{x:M,y,font:bold,size,color:navy});y-=dropAfter;};
  // Reserves a little extra room beyond the heading's own height so it isn't left alone at the very
  // bottom of a page with its first line of content pushed to the next one.
  // NOTE: fixed a pre-existing bug here — the divider line used to sit only 3pt above whatever content
  // followed, which at these font sizes visually struck through the first line of body text under a
  // heading (confirmed in a render of the original, unmodified sample report, not something introduced
  // by this pass). The extra 6pt after the line gives real clearance.
  const title=(text:string,size=11)=>{ensure(size+30);page.drawText(clean(text),{x:M,y,font:bold,size,color:navy});y-=size+7;page.drawLine({start:{x:M,y:y+3},end:{x:W-M,y:y+3},thickness:.45,color:rgb(.55,.57,.6)});y-=6;};
  // No maxLines cap here: the brief is explicit that a report must never clip or silently drop content
  // to fit a page budget. Long narrative text simply flows onto another page via ensure().
  const para=(text:string,size=7.6)=>{for(const line of wrap(text,regular,size,contentW)){ensure(size*1.32);page.drawText(line,{x:M,y,font:regular,size,color:rgb(.13,.13,.14)});y-=size*1.32;}y-=5;};
  const plain=(text:string,size:number,font:PDFFont,color=navy)=>{ensure(size+4);page.drawText(clean(text),{x:M,y,font,size,color});y-=size+4;};

  const tableHeadHeight=15;
  const columns=()=>({widths:[22,184,49,269] as const,x:[M,M+22,M+206,M+255] as const});
  const drawTableHead=()=>{
    const {widths,x}=columns();
    ensure(tableHeadHeight+4);
    page.drawRectangle({x:M,y:y-tableHeadHeight+4,width:contentW,height:tableHeadHeight,color:navy});
    ["#","Criterion","Status","Note"].forEach((label,i)=>page.drawText(label,{x:x[i]+4,y:y-6,font:bold,size:6,color:rgb(1,1,1)}));
    y-=tableHeadHeight;
    return {widths,x};
  };

  // Computes a row's real drawn height from its actual wrapped line count, independent of the current
  // y-position on the page. This is what lets the orphan guard below reserve the ACTUAL height the first
  // row will need — a fixed 18pt assumption was wrong for a long AI-written note, which is exactly the
  // case that produced an orphaned heading + empty table header (see docs/audit-report-template.md).
  const rowHeight=(item:{title:string;note:string;action?:string})=>{
    const {widths}=columns();
    const note=item.note+(item.action?` ${item.action}`:"");
    const criterionLines=wrap(item.title,regular,6.35,widths[1]-8,4);
    const noteLines=wrap(note,regular,6.25,widths[3]-8,10);
    const lines=Math.max(criterionLines.length,noteLines.length,1);
    return Math.max(18,lines*7.5+7);
  };

  const sectionTable=(sectionId:string)=>{
    const section=sections.find(item=>item.id===sectionId)!;
    const items=findings.filter(item=>item.section===sectionId);
    if(!items.length)return;
    // Reserve room for the heading, its underline, the table header, and the FIRST row's real height
    // together — otherwise a heading could be drawn at the very bottom of a page with its table (or an
    // unexpectedly tall first row) pushed to the next one, leaving it orphaned.
    ensure(10.2+16+tableHeadHeight+rowHeight(items[0]));
    title(section.title,10.2);
    let head=drawTableHead();
    for(const item of items){
      const note=item.note+(item.action?` ${item.action}`:"");
      // Generous (not zero) line caps on table cells keep rows a sane height while avoiding the old
      // 2-line/4-line caps, which would silently truncate a slightly longer AI-written finding.
      const criterionLines=wrap(item.title,regular,6.35,head.widths[1]-8,4);
      const noteLines=wrap(note,regular,6.25,head.widths[3]-8,10);
      const h=rowHeight(item);
      if(y-h<BOTTOM){newPage();title(`${section.title} (continued)`,10.2);head=drawTableHead();}
      page.drawRectangle({x:M,y:y-h+4,width:contentW,height:h,color:rgb(.985,.985,.985),borderColor:rgb(.63,.64,.66),borderWidth:.35});
      [head.x[1],head.x[2],head.x[3]].forEach(xx=>page.drawLine({start:{x:xx,y:y+4},end:{x:xx,y:y-h+4},thickness:.35,color:rgb(.63,.64,.66)}));
      const n=findings.indexOf(item)+1;
      page.drawText(String(n),{x:head.x[0]+6,y:y-8,font:regular,size:6.3,color:navy});
      criterionLines.forEach((line,i)=>page.drawText(line,{x:head.x[1]+4,y:y-8-i*7.5,font:regular,size:6.35,color:navy}));
      const color=item.status==="pass"?green:item.status==="weak"?amber:item.status==="fail"?red:gray;
      page.drawText(item.status==="nv"?"N/V":item.status.toUpperCase(),{x:head.x[2]+5,y:y-8,font:bold,size:6.2,color});
      noteLines.forEach((line,i)=>page.drawText(line,{x:head.x[3]+4,y:y-8-i*7.5,font:regular,size:6.25,color:navy}));
      y-=h;
    }
    y-=8;
  };

  newPage();
  page.drawText("UPWORK PROFILE AUDIT REPORT",{x:151,y,font:bold,size:15,color:navy});y-=15;
  page.drawText("Improvexus — Profile Growth & Positioning Audit",{x:191,y,font:italic,size:7.5,color:gray});y-=24;
  const track=[report.profile.jss&&`${report.profile.jss} Job Success`,report.profile.jobs&&`${report.profile.jobs} jobs`].filter(Boolean).join(", ")||"Not supplied";
  const meta=[["Prepared for:",report.profile.name||"Profile owner"],["Profile / Title:",report.profile.title||"Not supplied"],["Hourly Rate:",report.profile.rate||"Not supplied"],["Track Record:",track],["Date:",new Date(report.generatedAt||Date.now()).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})]];
  for(const [label,value] of meta){
    ensure(16);
    page.drawRectangle({x:M,y:y-14,width:contentW,height:16,borderColor:rgb(.55,.56,.58),borderWidth:.4});
    page.drawLine({start:{x:M+132,y:y+2},end:{x:M+132,y:y-14},thickness:.4,color:rgb(.55,.56,.58)});
    page.drawText(label,{x:M+5,y:y-8,font:bold,size:6.8,color:navy});
    page.drawText(clean(value).slice(0,105),{x:M+137,y:y-8,font:regular,size:6.8,color:navy});
    y-=16;
  }
  y-=12;
  heading("Snapshot",10,13); para(report.executiveSummary,7.25);
  ensure(52);
  const boxY=y;page.drawRectangle({x:M,y:boxY-40,width:contentW,height:43,borderColor:navy,borderWidth:.5});page.drawRectangle({x:M,y:boxY-12,width:contentW,height:15,color:navy});page.drawLine({start:{x:M+238,y:boxY+3},end:{x:M+238,y:boxY-40},thickness:.5,color:rgb(.55,.56,.58)});page.drawText("OVERALL SCORE",{x:M+5,y:boxY-7,font:bold,size:6.6,color:rgb(1,1,1)});page.drawText("BIGGEST FLAW",{x:M+243,y:boxY-7,font:bold,size:6.6,color:rgb(1,1,1)});page.drawText(scoreHeadline(score),{x:M+5,y:boxY-26,font:bold,size:9.4,color:navy});page.drawText(`${score.pass} Pass · ${score.weak} Weak · ${score.fail} Fail${score.nv?` · ${score.nv} N/V`:""}`,{x:M+5,y:boxY-36,font:italic,size:6.2,color:gray});wrap(report.biggestFlaw,regular,6.5,contentW-248,3).forEach((line,i)=>page.drawText(line,{x:M+243,y:boxY-24-i*7.5,font:regular,size:6.5,color:navy}));y-=52;
  heading("Why This Comes First",9.5,12); para(report.whyThisComesFirst,7.1);
  heading("What Is Already Working",9.5,12); para(report.alreadyWorking,7.1);
  heading("Full Breakdown",10,16);
  for(const s of sections) sectionTable(s.id);

  title("Priority Fixes",10.5);
  report.priorities.forEach((item,i)=>para(`${i+1}. ${item.title}: ${item.detail}`,7.15));
  title("Quick Profile Settings Checklist",10.5);
  report.priorities.forEach(item=>para(`[ ] ${item.title}`,7));
  title("Beyond This Audit",10.5);
  para("A stronger profile earns more views, but it still needs proposals that convert and a presence beyond Upwork to fully pay off.",7.2);
  para("Upwork Bidding & Proposal Writing: Proposals matched to each job post, written to get replies, not just sent. Upwork & LinkedIn Profile Optimization: Consistent positioning across both platforms. Email Marketing: Outreach and nurture campaigns beyond Upwork.",7.1);
  plain("Interested in any of these? Reply and we will scope it out together.",7.1,italic,navy);

  doc.getPages().forEach((p,i)=>{p.drawText("Prepared by Improvexus",{x:M,y:24,font:regular,size:6.3,color:gray});p.drawText(`Page ${i+1} of ${doc.getPageCount()}`,{x:W-M-44,y:24,font:regular,size:6.3,color:gray});});
  return doc.save();
}

const borders={top:{style:BorderStyle.SINGLE,size:1,color:"8B8B8B"},bottom:{style:BorderStyle.SINGLE,size:1,color:"8B8B8B"},left:{style:BorderStyle.SINGLE,size:1,color:"8B8B8B"},right:{style:BorderStyle.SINGLE,size:1,color:"8B8B8B"},insideHorizontal:{style:BorderStyle.SINGLE,size:1,color:"8B8B8B"},insideVertical:{style:BorderStyle.SINGLE,size:1,color:"8B8B8B"}};
function cell(text:string,width:number,header=false,center=false,color="172033"){return new TableCell({width:{size:width,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,margins:{top:70,bottom:70,left:90,right:90},shading:{fill:header?"172033":"FFFFFF"},children:clean(text).split("\n").map(line=>new Paragraph({alignment:center?AlignmentType.CENTER:AlignmentType.LEFT,spacing:{after:0,line:190},children:[new TextRun({text:line,font:"Times New Roman",size:15,bold:header,color:header?"FFFFFF":color})]}))});}
function heading(text:string){return new Paragraph({spacing:{before:150,after:60},keepNext:true,children:[new TextRun({text,font:"Times New Roman",size:22,bold:true,color:"172033"})]});}
function body(text:string){return new Paragraph({spacing:{after:90,line:220},children:[new TextRun({text:clean(text),font:"Times New Roman",size:17,color:"202020"})]});}
function findingTable(findings:AuditReport["findings"],ids:string[]){const rows=[new TableRow({tableHeader:true,cantSplit:true,children:[cell("#",400,true,true),cell("Criterion",3150,true),cell("Status",900,true,true),cell("Note",4910,true)]})];ids.forEach(id=>{const f=findings.find(item=>item.id===id)!;const n=findings.indexOf(f)+1;const color=f.status==="pass"?"137033":f.status==="weak"?"98620A":f.status==="fail"?"A61E1E":"666666";rows.push(new TableRow({cantSplit:true,children:[cell(String(n),400,false,true),cell(f.title,3150),cell(f.status==="nv"?"N/V":f.status.toUpperCase(),900,false,true,color),cell(`${f.note}${f.action?` ${f.action}`:""}`,4910)]}));});return new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[400,3150,900,4910],borders,rows});}

// Builds the Document object shared by both output paths below. Pulled out as its own function
// purely so the server (Drive filing, which needs a Buffer, not a browser Blob) can reuse the exact
// same locked report-building logic as the client download — no visual or structural change from
// the single createAuditDocx() this replaces internally.
function buildDocxDocument(report:AuditReport){
  const findings=canonicalOrder(report.findings);
  const score=summarize(findings);
  const children:(Paragraph|Table)[]=[];
  children.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:20},children:[new TextRun({text:"UPWORK PROFILE AUDIT REPORT",font:"Times New Roman",size:32,bold:true,color:"172033"})]}),new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:220},children:[new TextRun({text:"Improvexus — Profile Growth & Positioning Audit",font:"Times New Roman",size:16,italics:true,color:"666666"})]}));
  const meta=[["Prepared for:",report.profile.name||"Profile owner"],["Profile / Title:",report.profile.title||"Not supplied"],["Hourly Rate:",report.profile.rate||"Not supplied"],["Track Record:",[report.profile.jss&&`${report.profile.jss} Job Success`,report.profile.jobs&&`${report.profile.jobs} jobs`].filter(Boolean).join(", ")||"Not supplied"],["Date:",new Date(report.generatedAt||Date.now()).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})]];
  children.push(
    new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[2200,7160],borders,rows:meta.map(row=>new TableRow({cantSplit:true,children:[cell(row[0],2200),cell(row[1],7160)]}))}),
    heading("Snapshot"),body(report.executiveSummary),
    new Table({width:{size:9360,type:WidthType.DXA},columnWidths:[4000,5360],borders,rows:[new TableRow({children:[cell("OVERALL SCORE",4000,true),cell("BIGGEST FLAW",5360,true)]}),new TableRow({cantSplit:true,children:[cell(`${scoreHeadline(score)}\n${scoreDetail(score)}`,4000),cell(report.biggestFlaw,5360)]})]}),
    heading("Why This Comes First"),body(report.whyThisComesFirst),
    heading("What Is Already Working"),body(report.alreadyWorking),
    heading("Full Breakdown"),
  );
  // Word paginates on its own as content flows, so — unlike the hand-drawn PDF above — no manual page
  // breaks are forced here. A shorter or longer client profile simply takes fewer or more pages; nothing
  // is clipped and no page ends up with an awkward gap because a break was hardcoded for Jawad's report.
  for(const sec of sections){
    const ids=findings.filter(f=>f.section===sec.id).map(f=>f.id);
    if(!ids.length)continue;
    children.push(heading(sec.title),findingTable(findings,ids));
  }
  children.push(heading("Priority Fixes"));
  report.priorities.forEach((p,i)=>children.push(body(`${i+1}. ${p.title}: ${p.detail}`)));
  children.push(heading("Quick Profile Settings Checklist"));
  report.priorities.forEach(p=>children.push(body(`☐ ${p.title}`)));
  children.push(
    heading("Beyond This Audit"),
    body("A stronger profile earns more views, but it still needs proposals that convert and a presence beyond Upwork to fully pay off."),
    body("Upwork Bidding & Proposal Writing: Proposals matched to each job post, written to get replies, not just sent. Upwork & LinkedIn Profile Optimization: Consistent positioning across both platforms. Email Marketing: Outreach and nurture campaigns beyond Upwork."),
    new Paragraph({children:[new TextRun({text:"Interested in any of these? Reply and we will scope it out together.",font:"Times New Roman",size:17,italics:true})]}),
  );
  const header=new Header({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:"IMPROVEXUS · CONFIDENTIAL PROFILE AUDIT",font:"Times New Roman",size:13,bold:true,color:"888888"})]})]});
  const footer=new Footer({children:[new Paragraph({children:[new TextRun({text:"Prepared by Improvexus                                              Page ",font:"Times New Roman",size:13,color:"777777"}),new TextRun({children:[PageNumber.CURRENT],font:"Times New Roman",size:13,color:"777777"}),new TextRun({text:" of ",font:"Times New Roman",size:13,color:"777777"}),new TextRun({children:[PageNumber.TOTAL_PAGES],font:"Times New Roman",size:13,color:"777777"})]})]});
  return new Document({creator:"Improvexus",title:clean(report.reportName),sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:720,right:1440,bottom:650,left:1440}}},headers:{default:header},footers:{default:footer},children}]});
}
export async function createAuditDocx(report:AuditReport){return Packer.toBlob(buildDocxDocument(report));}
// Server-side counterpart of createAuditDocx: same Document, delivered as a Node Buffer instead of
// a browser Blob, for the Google Drive filing path (app/api runs in Node, not a browser).
export async function createAuditDocxBuffer(report:AuditReport){return Packer.toBuffer(buildDocxDocument(report));}

function safeFilename(value:string){return clean(value).replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").slice(0,80)||"Upwork-Profile-Audit";}
export async function downloadAuditReport(report:AuditReport,format:"pdf"|"docx"){const blob=format==="pdf"?new Blob([new Uint8Array(await createAuditPdf(report))],{type:"application/pdf"}):await createAuditDocx(report);const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${safeFilename(report.reportName)}.${format}`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function downloadSampleReport(format:"pdf"|"docx"){return downloadAuditReport(sampleAuditReport,format);}
