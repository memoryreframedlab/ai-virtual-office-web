const toggle = document.querySelector('#nav-toggle');
const nav = document.querySelector('#site-nav');
const dialog = document.querySelector('#booking-dialog');
let lastTrigger = null;
function closeMenu(){toggle.setAttribute('aria-expanded','false');nav.classList.remove('open');}
toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));nav.classList.toggle('open',!open);});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
document.querySelectorAll('[data-book]').forEach(button=>button.addEventListener('click',()=>{lastTrigger=button;closeMenu();dialog.showModal();document.body.classList.add('dialog-open');}));
function closeDialog(){dialog.close();}
document.querySelectorAll('.dialog-close,.dialog-done').forEach(button=>button.addEventListener('click',closeDialog));
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
dialog.addEventListener('close',()=>{document.body.classList.remove('dialog-open');if(lastTrigger?.getClientRects().length){lastTrigger.focus();}else{toggle.focus();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
window.matchMedia('(min-width:761px)').addEventListener('change',closeMenu);


// Motion follows meaning: ordered steps, choices, emphasis, and photographs.
// Normal paragraphs remain still. Numbered steps enter clearly in reading order.
(() => {
 const root=document.documentElement;
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 const control=document.querySelector('.motion-toggle');
 const bookingBar=document.querySelector('.booking-bar');
 const hero=document.querySelector('.hero');
 const inlineButtons=[...document.querySelectorAll('main [data-book]')];
 const definitions=[
  ['.hero-image','zoom'],['.hero h1','headline'],
  ['.problem-image','curtain'],['.problem h2','title-wipe'],
  ['.philosophy h2','title-tone'],['.condition-map li','connect'],
  ['.care-copy>p:first-of-type','listen'],
  ['.finish-image','focus'],['.finish-copy h2','title-rule'],
  ['.closing h2','closing-title'],['.closing .cta','invite']
 ];
 const targets=[];
 definitions.forEach(([selector,type])=>document.querySelectorAll(selector).forEach(el=>{el.dataset.motion=type;targets.push(el);}));
 const groups=[
  {element:document.querySelector('.steps'),selector:'li',type:'step',gap:720,duration:700},
  {element:document.querySelector('.menu-items'),selector:'.menu-item',type:'choice',gap:360,duration:650}
 ].map(g=>({...g,cards:[...g.element.querySelectorAll(g.selector)],nextStart:0,scheduled:new Map()}));
 groups.forEach(g=>g.cards.forEach((card,index)=>{
  card.dataset.sequence=g.type;card.dataset.sequenceIndex=String(index+1);
  card.addEventListener('animationend',event=>{if(event.target===card){card.classList.remove('is-sequence-animating');g.scheduled.delete(card);}});
 }));
 let manuallyPaused=false,observer,cardObserver,groupObserver,framePending=false;
 function reduced(){return media.matches||manuallyPaused;}
 function showAll(){
  targets.forEach(el=>el.classList.add('is-played'));
  groups.forEach(g=>g.cards.forEach(card=>{card.classList.add('is-sequence-visible');card.classList.remove('is-sequence-animating');card.style.setProperty('--sequence-delay','0ms');}));
 }
 function resetGroup(g){
  g.nextStart=0;g.scheduled.clear();
  g.cards.forEach(card=>{card.classList.remove('is-sequence-visible','is-sequence-animating');card.style.removeProperty('--sequence-delay');});
 }
 function setMode(){
  const paused=reduced();root.classList.toggle('reduce-motion',paused);root.classList.toggle('motion-ready',!paused);
  observer?.disconnect();cardObserver?.disconnect();groupObserver?.disconnect();
  control.hidden=false;control.disabled=media.matches;control.setAttribute('aria-pressed',String(paused));
  control.textContent=media.matches?'動きを抑えています':manuallyPaused?'動きを再開する':'動きを止める';
  if(paused||!('IntersectionObserver' in window)){showAll();return;}
  try{
   observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!reduced()&&entry.isIntersecting){entry.target.classList.add('is-played');observer.unobserve(entry.target);}}),{threshold:.3,rootMargin:'0px 0px -10% 0px'});
   targets.filter(el=>!el.classList.contains('is-played')).forEach(el=>observer.observe(el));
   cardObserver=new IntersectionObserver(entries=>{
    if(reduced())return;
    const now=performance.now();
    groups.forEach(g=>{
     entries.filter(e=>!e.isIntersecting&&g.cards.includes(e.target)&&e.target.classList.contains('is-sequence-animating')).forEach(({target:card})=>{
      card.classList.remove('is-sequence-visible','is-sequence-animating');card.style.removeProperty('--sequence-delay');g.scheduled.delete(card);
      g.nextStart=Math.max(now,...[...g.scheduled.values()].map(start=>start+g.gap));
     });
     const entering=entries.filter(e=>e.isIntersecting&&g.cards.includes(e.target)&&!e.target.classList.contains('is-sequence-visible')).sort((a,b)=>g.cards.indexOf(a.target)-g.cards.indexOf(b.target));
     entering.forEach(({target:card})=>{
      const start=Math.max(now+100,g.nextStart);
      card.style.setProperty('--sequence-delay',`${Math.max(0,start-now)}ms`);
      card.classList.add('is-sequence-visible','is-sequence-animating');
      g.scheduled.set(card,start);g.nextStart=start+g.gap;
     });
    });
   },{threshold:.35,rootMargin:'-85px 0px -14% 0px'});
   groups.forEach(g=>g.cards.forEach(card=>cardObserver.observe(card)));
   // A fresh visit to the steps shows the order again, instead of consuming it off-screen.
   groupObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(!reduced()&&!entry.isIntersecting){const g=groups.find(x=>x.element===entry.target);resetGroup(g);}
   }),{threshold:0,rootMargin:'70px 0px 70px 0px'});
   groups.forEach(g=>groupObserver.observe(g.element));
  }catch{root.classList.remove('motion-ready');showAll();}
 }
 function paintProgress(){
  const max=root.scrollHeight-innerHeight;root.style.setProperty('--reading-progress',max>0?Math.min(1,Math.max(0,scrollY/max)):0);
  root.classList.toggle('is-scrolled',scrollY>24);
  const inlineVisible=inlineButtons.some(button=>{const r=button.getBoundingClientRect();return r.top>90&&r.bottom<innerHeight;});
  if(!bookingBar.contains(document.activeElement))bookingBar.hidden=!(hero.getBoundingClientRect().bottom<0&&!inlineVisible);
  framePending=false;
 }
 function scheduleProgress(){if(!framePending){framePending=true;requestAnimationFrame(paintProgress);}}
 control.addEventListener('click',()=>{manuallyPaused=!manuallyPaused;setMode();});
 media.addEventListener('change',setMode);addEventListener('scroll',scheduleProgress,{passive:true});addEventListener('resize',scheduleProgress,{passive:true});
 document.addEventListener('focusin',event=>{const card=event.target.closest('[data-sequence]');if(card){card.classList.add('is-sequence-visible');card.classList.remove('is-sequence-animating');}});
 setMode();paintProgress();
})();
