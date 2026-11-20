const pptxgen = require("pptxgenjs");
const p = new pptxgen();
p.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
p.theme = { headFontFace: "Space Grotesk", bodyFontFace: "Plus Jakarta Sans" };
p.author = "Priyanshu Senapati, Gourab Dash, Vinochan R";
p.title = "Voyance - TBO VoyageHack 4.0";

// ---- fonts ----
const DISP="Space Grotesk", BODY="Plus Jakarta Sans", BLACK="Jakarta Black";
// ---- palette ----
const NAVY="121A3A", NAVY2="0A1230", INK="1E2740", BLUE="3451D1", BLUE2="5B7BFF",
      SKY="3B82F6", GREEN="0E9E6E", MINT="2EE6A6", MUTED="707B93", TINT="EDF1FC", TINT2="F6F8FE",
      ICE="C8D4F4", ICE2="8695C2", WHITE="FFFFFF", LINE="E2E8F6", GOLD="E8A13A", CARD="192452";

const sh  = () => ({ type:"outer", color:"121A3A", opacity:0.20, blur:9,  offset:4, angle:90 });
const shS = () => ({ type:"outer", color:"0A1230", opacity:0.34, blur:18, offset:7, angle:90 });

function logoV(s,x,y,sz,fs){
  s.addShape(p.ShapeType.roundRect,{x,y,w:sz,h:sz,rectRadius:sz*0.27,fill:{color:BLUE2},line:{type:"none"},shadow:sh(),objectName:"logoV"});
  s.addText("V",{x,y,w:sz,h:sz,align:"center",valign:"middle",fontFace:DISP,bold:true,color:WHITE,fontSize:fs,margin:0,isTextBox:true,objectName:"logoVt"});
}
function darkBg(s){
  s.background={color:NAVY};
  s.addShape(p.ShapeType.ellipse,{x:8.3,y:-2.6,w:9,h:9,fill:{color:BLUE2,transparency:84},line:{type:"none"},objectName:"glowA"});
  s.addShape(p.ShapeType.ellipse,{x:-3,y:4.3,w:7.5,h:7.5,fill:{color:SKY,transparency:90},line:{type:"none"},objectName:"glowB"});
}
// kicker with an editorial index, e.g.  01 — THE PROBLEM
function kicker(s,x,y,idx,label,color){
  s.addText([{text:idx+"  ",options:{fontFace:DISP,bold:true,color:BLUE2}},{text:"— "+label,options:{fontFace:BODY,bold:true,color,charSpacing:2.5}}],
    {x,y,w:9,h:0.32,fontSize:12.5,margin:0,isTextBox:true,objectName:"kicker"});
}

// =================== SLIDE 1 — TITLE ===================
let s=p.addSlide(); darkBg(s);
logoV(s,0.85,0.78,1.0,46);
s.addText("VOYANCE",{x:2.02,y:0.9,w:5,h:0.4,fontFace:DISP,bold:true,color:WHITE,fontSize:19,charSpacing:4,valign:"middle",margin:0,isTextBox:true});
s.addText("01 / 04",{x:11.4,y:0.92,w:1.25,h:0.35,align:"right",fontFace:DISP,color:ICE2,fontSize:14,margin:0,isTextBox:true});
s.addText("TBO VOYAGEHACK 4.0   ·   PROBLEM 1 — INVENTORY OPTIMIZATION",{x:0.9,y:2.1,w:11.6,h:0.32,fontFace:BODY,bold:true,color:BLUE2,fontSize:13,charSpacing:2.5,margin:0,isTextBox:true});
s.addText([{text:"Sees hotel demand\n",options:{color:WHITE}},{text:"before it sells out.",options:{color:BLUE2}}],
  {x:0.86,y:2.55,w:11.8,h:2.0,fontFace:DISP,bold:true,fontSize:62,lineSpacingMultiple:0.98,charSpacing:-0.5,margin:0,isTextBox:true,objectName:"heroTitle"});
s.addText("A pre-buy planner for TBO's hotel buyers. Budget and risk in — a ranked buy list out, with a reason for every single room.",
  {x:0.9,y:4.72,w:8.4,h:0.9,fontFace:BODY,fontSize:17,color:ICE,lineSpacingMultiple:1.22,margin:0,isTextBox:true});
// proof chip
s.addShape(p.ShapeType.roundRect,{x:0.9,y:5.78,w:8.9,h:0.72,rectRadius:0.12,fill:{color:CARD},line:{color:"2B3A74",width:1},objectName:"proofChip"});
s.addText([
  {text:"PROVEN  ",options:{fontFace:DISP,bold:true,color:MINT,charSpacing:1.5}},
  {text:"+7–13% more profit",options:{fontFace:DISP,bold:true,color:WHITE}},
  {text:"  ·  35–46% fewer guests turned away  ·  on real 2017 bookings",options:{fontFace:BODY,color:ICE}},
],{x:1.18,y:5.78,w:8.5,h:0.72,fontSize:13.5,valign:"middle",margin:0,isTextBox:true});
s.addText("Priyanshu Senapati   ·   Gourab Dash   ·   Vinochan R   ·   Mohammad Mohsin Irfan",
  {x:0.9,y:6.85,w:12,h:0.4,fontFace:BODY,bold:true,color:ICE2,fontSize:13.5,margin:0,isTextBox:true});

// =================== SLIDE 2 — PROBLEM ===================
s=p.addSlide(); s.background={color:WHITE};
logoV(s,0.6,0.5,0.46,22);
s.addText("02 / 04",{x:11.4,y:0.5,w:1.25,h:0.35,align:"right",fontFace:DISP,color:"C6CEDE",fontSize:14,margin:0,isTextBox:true});
kicker(s,1.2,0.56,"01","THE PROBLEM",MUTED);
s.addText("Sold-out dates hide demand — so TBO under-buys",
  {x:1.19,y:0.86,w:11.7,h:0.6,fontFace:DISP,bold:true,color:NAVY,fontSize:26,charSpacing:-0.3,margin:0,isTextBox:true,objectName:"title"});

s.addText("WHAT GOES WRONG TODAY",{x:0.6,y:1.62,w:6,h:0.3,fontFace:BODY,bold:true,color:BLUE,fontSize:12.5,charSpacing:1.5,margin:0,isTextBox:true});
s.addText("TBO pre-buys rooms from booking history. But a search that hits “sold out” never becomes a booking — so the busiest December dates look smaller than they were, and the plan quietly buys too few of the rooms that actually sell.",
  {x:0.6,y:1.97,w:5.95,h:1.2,fontFace:BODY,fontSize:14.5,color:INK,lineSpacingMultiple:1.26,margin:0,isTextBox:true});
s.addText("ONE DECEMBER — WHAT BOOKING DATA SEES vs TRUE DEMAND",{x:0.6,y:3.22,w:6,h:0.3,fontFace:BODY,bold:true,color:MUTED,fontSize:11,charSpacing:.5,margin:0,isTextBox:true});
const weeks=[["1–7 Dec",40,8,false],["8–14",55,16,false],["15–21",70,44,true],["22–28",70,62,true]];
const bx=0.75,by=5.5,bw=1.15,gap=0.28,unit=0.0145;
weeks.forEach((wk,i)=>{const[lbl,book,hid,so]=wk;const x=bx+i*(bw+gap);const hb=book*unit,hh=hid*unit;
  s.addShape(p.ShapeType.roundRect,{x,y:by-hb-hh,w:bw,h:hh,rectRadius:0.03,fill:{color:BLUE2,transparency:60},line:{type:"none"},objectName:`hid${i}`});
  s.addShape(p.ShapeType.roundRect,{x,y:by-hb,w:bw,h:hb,rectRadius:0.03,fill:{color:BLUE},line:{type:"none"},objectName:`book${i}`});
  if(so)s.addText("sold out",{x:x-0.05,y:by-hb-0.22,w:bw+0.1,h:0.2,align:"center",fontFace:DISP,bold:true,fontSize:8,color:GOLD,margin:0,isTextBox:true});
  s.addText(lbl,{x:x-0.1,y:by+0.06,w:bw+0.2,h:0.22,align:"center",fontFace:BODY,fontSize:9.5,color:INK,margin:0,isTextBox:true});});
s.addShape(p.ShapeType.rect,{x:0.78,y:6.0,w:0.2,h:0.2,fill:{color:BLUE},line:{type:"none"}});
s.addText("Bookings",{x:1.04,y:5.96,w:1.3,h:0.3,fontFace:BODY,fontSize:10,color:INK,valign:"middle",margin:0,isTextBox:true});
s.addShape(p.ShapeType.rect,{x:2.4,y:6.0,w:0.2,h:0.2,fill:{color:BLUE2,transparency:60},line:{type:"none"}});
s.addText("Hidden demand",{x:2.66,y:5.96,w:2,h:0.3,fontFace:BODY,fontSize:10,color:INK,valign:"middle",margin:0,isTextBox:true});

s.addText("WHY THIS PROBLEM IS WORTH SOLVING",{x:7.0,y:1.62,w:6,h:0.3,fontFace:BODY,bold:true,color:BLUE,fontSize:12.5,charSpacing:1.5,margin:0,isTextBox:true});
function why(x,y,w,n,t,d){
  s.addShape(p.ShapeType.ellipse,{x,y,w:0.5,h:0.5,fill:{color:BLUE},line:{type:"none"},shadow:sh(),objectName:`whyc${n}`});
  s.addText(String(n),{x,y,w:0.5,h:0.5,align:"center",valign:"middle",fontFace:DISP,bold:true,color:WHITE,fontSize:17,margin:0,isTextBox:true});
  s.addText([{text:t+"   ",options:{fontFace:DISP,bold:true,color:NAVY}},{text:d,options:{fontFace:BODY,color:INK}}],
    {x:x+0.72,y:y-0.04,w:w-0.72,h:0.62,fontSize:13,lineSpacingMultiple:1.12,valign:"middle",margin:0,isTextBox:true});
}
why(7.0,1.98,5.85,1,"Hotels drive TBO's growth.","67% of GTV, growing 39% a year (Q2 FY27).");
why(7.0,2.78,5.85,2,"The brief asks for exactly this.","buy smarter using sold-outs and look-to-book.");
why(7.0,3.58,5.85,3,"Only TBO can see it.","every sold-out search across 34,529 buyers.");
function imp(x,num,unit,nc,label){
  s.addShape(p.ShapeType.roundRect,{x,y:4.55,w:2.82,h:1.66,rectRadius:0.12,fill:{color:TINT},line:{color:LINE,width:1},shadow:sh(),objectName:`imp${x}`});
  s.addText([{text:num,options:{fontFace:DISP,bold:true,color:nc,fontSize:33}},{text:unit,options:{fontFace:DISP,bold:true,color:nc,fontSize:15}}],
    {x:x+0.22,y:4.72,w:2.5,h:0.62,margin:0,isTextBox:true});
  s.addText(label,{x:x+0.22,y:5.38,w:2.45,h:0.78,fontFace:BODY,fontSize:11,color:INK,lineSpacingMultiple:1.08,margin:0,isTextBox:true});
}
imp(7.0,"₹4.5–6.3"," cr/yr",GREEN,"extra profit — per 1% of TBO's hotel sales bought ahead (estimate).");
imp(10.03,"35–46","%",BLUE,"fewer room-nights turned away on sell-out dates (real 2017).");
s.addText("Sources: TBO Tek press release, Q2 FY27 (2 Nov 2026). Impact: walk-forward test on real 2017 bookings, 2 hotels (Antonio et al. 2019).",
  {x:0.6,y:6.95,w:12.1,h:0.3,fontFace:BODY,fontSize:9.5,color:MUTED,margin:0,isTextBox:true});

// =================== SLIDE 3 — PRODUCT ===================
s=p.addSlide(); s.background={color:WHITE};
logoV(s,0.6,0.5,0.46,22);
s.addText("03 / 04",{x:11.4,y:0.5,w:1.25,h:0.35,align:"right",fontFace:DISP,color:"C6CEDE",fontSize:14,margin:0,isTextBox:true});
kicker(s,1.2,0.56,"02","THE PRODUCT",MUTED);
s.addText("From hidden demand to an approved buy list",
  {x:1.19,y:0.86,w:11.7,h:0.6,fontFace:DISP,bold:true,color:NAVY,fontSize:26,charSpacing:-0.3,margin:0,isTextBox:true,objectName:"title"});

s.addShape(p.ShapeType.roundRect,{x:0.52,y:1.5,w:6.86,h:3.86,rectRadius:0.12,fill:{color:WHITE},line:{color:LINE,width:1.25},shadow:shS(),objectName:"gifFrame"});
s.addImage({path:"assets/round2/gif_buydesk.gif",x:0.62,y:1.6,w:6.66,h:3.66,objectName:"heroGif"});
s.addText("Live Buy Desk (simulated data) — Goa, Christmas week: buy 85 rooms by 5 Aug, then a second person approves. Animated walkthrough.",
  {x:0.6,y:5.42,w:6.8,h:0.42,fontFace:BODY,italic:true,fontSize:10.5,color:MUTED,lineSpacingMultiple:1.05,margin:0,isTextBox:true});

s.addText("WHAT THE JUDGES CAN VERIFY",{x:7.75,y:1.55,w:5,h:0.3,fontFace:BODY,bold:true,color:BLUE,fontSize:12.5,charSpacing:1.5,margin:0,isTextBox:true});
function proof(y,num,unit,nc,label){
  s.addText([{text:num,options:{fontFace:DISP,bold:true,color:nc,fontSize:38}},{text:unit,options:{fontFace:DISP,bold:true,color:nc,fontSize:18}}],
    {x:7.75,y,w:5.1,h:0.64,margin:0,isTextBox:true});
  s.addText(label,{x:7.78,y:y+0.64,w:5.05,h:0.6,fontFace:BODY,fontSize:11.5,color:INK,lineSpacingMultiple:1.1,margin:0,isTextBox:true});
}
proof(1.95,"+7–13","%",GREEN,"more profit vs re-buying last year — real 2017, every 95% interval above zero.");
proof(3.2,"46","% fewer",BLUE,"guests turned away — the live Replay Race (this replay: +9.6% profit).");
proof(4.45,"+24 · +20","%",NAVY,"profit on a tight ₹40L budget · better worst-5% season at ₹2 cr (simulated).");

s.addText("HOW IT WORKS",{x:0.6,y:5.86,w:4,h:0.3,fontFace:BODY,bold:true,color:BLUE,fontSize:12,charSpacing:1.5,margin:0,isTextBox:true});
const steps=[["Signals","Sold-out searches + bookings","Kafka"],["Hidden demand","Sold-outs back in + a forecast","LightGBM"],["Optimizer","Profit vs worst-5%, in budget","HiGHS"],["Buy Desk API","Reasons, approvals, audit log","FastAPI"],["Dashboard","Review & approve each line","React · Cloud Run"]];
const pxs=0.6,py=6.2,pw=2.3,pgap=0.17;
steps.forEach((st,i)=>{const x=pxs+i*(pw+pgap);
  s.addShape(p.ShapeType.roundRect,{x,y:py,w:pw,h:0.95,rectRadius:0.1,fill:{color:TINT2},line:{color:LINE,width:1},objectName:`pipe${i}`});
  s.addText(st[0],{x:x+0.13,y:py+0.09,w:pw-0.26,h:0.26,fontFace:DISP,bold:true,color:NAVY,fontSize:12.5,margin:0,isTextBox:true});
  s.addText(st[1],{x:x+0.13,y:py+0.36,w:pw-0.26,h:0.34,fontFace:BODY,fontSize:9.2,color:INK,lineSpacingMultiple:1.0,margin:0,isTextBox:true});
  s.addText(st[2],{x:x+0.13,y:py+0.71,w:pw-0.26,h:0.2,fontFace:DISP,bold:true,fontSize:9,color:BLUE,margin:0,isTextBox:true});
  if(i<4)s.addText("›",{x:x+pw-0.02,y:py,w:pgap+0.04,h:0.95,align:"center",valign:"middle",fontFace:DISP,bold:true,fontSize:19,color:ICE2,margin:0,isTextBox:true});});

// =================== SLIDE 4 — CLOSE ===================
s=p.addSlide(); darkBg(s);
logoV(s,0.85,0.72,0.8,38);
s.addText("04 / 04",{x:11.4,y:0.78,w:1.25,h:0.35,align:"right",fontFace:DISP,color:ICE2,fontSize:14,margin:0,isTextBox:true});
s.addText("Thank you",{x:0.85,y:1.5,w:8.2,h:1.45,fontFace:DISP,bold:true,color:WHITE,fontSize:78,charSpacing:-1,margin:0,isTextBox:true,objectName:"heroTitle"});
s.addText([{text:"Buy December's rooms\n",options:{color:WHITE}},{text:"before the season shows.",options:{color:BLUE2}}],
  {x:0.87,y:3.12,w:8,h:1.0,fontFace:DISP,bold:true,fontSize:25,lineSpacingMultiple:1.06,charSpacing:-0.3,margin:0,isTextBox:true,objectName:"punch"});
const links=[["TRY IT","voyance-1029341879804.asia-south1.run.app"],["CODE","github.com/Priyanshu-senapati/voyage"]];
links.forEach((lk,i)=>{const y=4.62+i*0.8;
  s.addShape(p.ShapeType.roundRect,{x:0.9,y,w:7.4,h:0.66,rectRadius:0.1,fill:{color:CARD},line:{color:"2B3A74",width:1},objectName:`link${i}`});
  s.addText([{text:lk[0]+"   ",options:{fontFace:DISP,bold:true,color:BLUE2,charSpacing:1}},{text:lk[1],options:{fontFace:BODY,color:WHITE}}],
    {x:1.12,y,w:7.0,h:0.66,fontSize:13,valign:"middle",margin:0,isTextBox:true});});
// QR card with the drive link beneath
s.addShape(p.ShapeType.roundRect,{x:9.15,y:1.75,w:3.5,h:3.98,rectRadius:0.14,fill:{color:WHITE},shadow:shS(),objectName:"qrCard"});
s.addImage({path:"assets/round2/qr_video.png",x:9.9,y:1.98,w:2.0,h:2.0,objectName:"qrImg"});
s.addText("WATCH THE 2-MINUTE FILM",{x:9.3,y:4.12,w:3.2,h:0.3,align:"center",fontFace:DISP,bold:true,color:NAVY,fontSize:12.5,charSpacing:0.5,margin:0,isTextBox:true});
s.addText("Scan it, or open the link:",{x:9.3,y:4.44,w:3.2,h:0.26,align:"center",fontFace:BODY,fontSize:10,color:MUTED,margin:0,isTextBox:true});
s.addText("drive.google.com/file/d/1T5zJMHZQIS8KQbxdLXUMKW73DamgMMj1/view?usp=sharing",{x:9.26,y:4.72,w:3.28,h:0.85,align:"center",fontFace:BODY,bold:true,fontSize:8.5,color:BLUE,lineSpacingMultiple:1.14,margin:0,isTextBox:true});
s.addText("Priyanshu Senapati   ·   Gourab Dash   ·   Vinochan R   ·   Mohammad Mohsin Irfan",
  {x:0.9,y:6.72,w:12,h:0.4,fontFace:BODY,bold:true,color:ICE2,fontSize:13.5,margin:0,isTextBox:true});

p.writeFile({fileName:"voyance_round2.pptx"}).then(f=>console.log("wrote",f));
