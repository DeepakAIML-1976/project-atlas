import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, ArrowUpRight, BookOpenText, Boxes, CalendarDays, ChevronRight, Compass, FileStack, Fingerprint, GitBranch, LayoutDashboard, LogOut, Mail, Scale, ShieldCheck, Sliders, Video, X } from 'lucide-react';
import { useClerk } from '@clerk/react';

const links = [
  { href:'/overview', label:'Overview', icon:LayoutDashboard },
  { href:'/authorization-inbox', label:'Executive Inbox', icon:ShieldCheck },
  { href:'/email-inbox', label:'Email Ingest', icon:Mail },
  { href:'/live-meetings', label:'Live Bot', icon:Video },
  { href:'/knowledge-units', label:'Knowledge & Heuristics', icon:BookOpenText },
  { href:'/delegation-rules', label:'Delegation Rules', icon:Sliders },
  { href:'/twin', label:'My twin', icon:Fingerprint },
  { href:'/sources', label:'Sources', icon:FileStack },
  { href:'/meetings', label:'Meetings', icon:CalendarDays },
  { href:'/decisions', label:'Decisions', icon:Scale },
  { href:'/memory', label:'Memory', icon:GitBranch },
  { href:'/activity', label:'Activity', icon:Activity },
];

export function Brand({ light = false }: { light?:boolean }) {
  return <Link href="/" className="brand" data-testid="link-atlas-home"><span className="brand-mark">a</span><span className="brand-text" style={{color:light?'#292538':undefined}}>atlas<span style={{color:'#c97b59'}}>.</span></span></Link>;
}

export function Shell({ children, workspace }: { children:ReactNode; workspace?:string }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const current = links.find(l=>l.href===location)?.label ?? 'Workspace';
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="sidebar-caption">Workspace / Navigate</div>
      <nav className="nav-list" aria-label="Workspace navigation">{links.map(({href,label,icon:Icon})=><Link href={href} className={`nav-item ${location===href?'active':''}`} key={href} title={label} data-testid={`link-${label.toLowerCase().replace(' ','-')}`}><Icon/><span>{label}</span></Link>)}</nav>
      <div className="sidebar-bottom">
        <div className="eyebrow" style={{color:'#dba581',fontSize:9}}>CURRENT SPACE</div>
        <p style={{margin:'8px 0 18px',fontSize:12,color:'#e8e1dc',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} data-testid="text-workspace-name">{workspace || 'Your workspace'}</p>
        <button className="nav-item" style={{width:'100%',border:0,background:'transparent'}} onClick={()=>signOut({redirectUrl:import.meta.env.BASE_URL})} data-testid="button-sign-out"><LogOut/><span>Sign out</span></button>
      </div>
    </aside>
    <div className="shell-main">
      <header className="topbar"><div className="crumb"><span>Atlas</span><ChevronRight size={13}/><strong>{current}</strong></div><div className="badge green"><ShieldCheck size={11}/> Human governed</div></header>
      <main className="main-content reveal">{children}</main>
    </div>
  </div>;
}

export function PageHead({ eyebrow, title, italic, description, action }: {eyebrow:string;title:string;italic?:string;description:string;action?:ReactNode}) {
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title} {italic&&<em>{italic}</em>}</h1><p className="page-lede">{description}</p></div>{action}</div>;
}
export function Empty({ icon:Icon = Boxes, title, description, action }: {icon?:typeof Boxes;title:string;description:string;action?:ReactNode}) {
  return <div className="empty"><div className="empty-icon"><Icon/></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function Load({ count=3 }: {count?:number}) { return <div className="stack">{Array.from({length:count},(_,i)=><div className="skeleton skeleton-card" key={i}/>)}</div>; }
export function ErrorState({retry}:{retry:()=>void}) { return <div className="error-card"><h3>We couldn’t load this part of your workspace.</h3><p>Your information hasn’t changed. Check your connection and try again.</p><button className="btn btn-outline" onClick={retry} data-testid="button-retry">Try again <ArrowUpRight size={14}/></button></div>; }
export function Modal({title,subtitle,onClose,children}:{title:string;subtitle?:string;onClose:()=>void;children:ReactNode}) {
  return <div className="dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="dialog" role="dialog" aria-modal="true" aria-label={title}><div className="dialog-head"><div><div className="eyebrow">ATLAS / WORKSPACE</div><h2>{title}</h2>{subtitle&&<p style={{margin:0}}>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog" data-testid="button-close-dialog"><X size={19}/></button></div>{children}</div></div>;
}
export const formatDate = (date?:string|null) => date ? new Date(date).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) : 'Not set';
export const displayKey = (key:string) => key.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase());
export function GoverningNote({children}:{children:ReactNode}) { return <div className="notice"><ShieldCheck/>{children}</div>; }
export const navCards = [
  {href:'/twin', title:'Shape your twin', copy:'Review the profile fields that define how your twin represents you.', icon:Fingerprint},
  {href:'/sources', title:'Bring your own evidence', copy:'Add a note or private file. Analysis happens only with your explicit consent.', icon:BookOpenText},
  {href:'/meetings', title:'Document a briefing', copy:'Record informed meetings, notes, and actions. Atlas does not attend live calls.', icon:CalendarDays},
  {href:'/decisions', title:'Keep the final say', copy:'Document a proposal and review it yourself before anything is decided.', icon:Scale},
];
export { Compass, GitBranch };