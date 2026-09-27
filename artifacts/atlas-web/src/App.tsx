import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useGetAtlasSession } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { ErrorState, Load, Shell } from '@/components/atlas-ui';
import { Landing } from '@/pages/landing';
import { Onboarding, Overview, Sources, Twin } from '@/pages/core';
import { Activity, Decisions, Meetings, Memory } from '@/pages/records';

const queryClient = new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false}}});
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
function stripBase(path:string):string {return basePath&&path.startsWith(basePath)?path.slice(basePath.length)||"/":path;}

const appearance = {
  variables:{
    colorPrimary:'#bd4e30',colorForeground:'#302b3f',colorMutedForeground:'#797480',
    colorDanger:'#a53626',colorBackground:'#fcfaf5',colorInput:'#fffdf8',
    colorInputForeground:'#302b3f',colorNeutral:'#d1c9c3',fontFamily:'DM Sans, sans-serif',borderRadius:'7px'
  },
  elements:{
    rootBox:{width:'100%',display:'flex',justifyContent:'center'},
    cardBox:{background:'#fcfaf5',width:'430px',maxWidth:'100%',border:'1px solid #d8d1c8',borderRadius:'10px',boxShadow:'none'},
    card:{boxShadow:'none',background:'transparent'},
    footer:{background:'transparent',boxShadow:'none'},
    headerTitle:{fontFamily:'Instrument Serif, serif',fontSize:'34px',fontWeight:400},
    formButtonPrimary:{background:'#c65131'},
  }
};

function CacheResetOnUserChange(){
  const {addListener}=useClerk(); const qc=useQueryClient();const prior=useRef<string|null|undefined>(undefined);
  useEffect(()=>{const unsub=addListener(({user})=>{const id=user?.id??null;if(prior.current!==undefined&&prior.current!==id)qc.clear();prior.current=id;});return unsub;},[addListener,qc]);
  return null;
}
function AuthPage({mode}:{mode:'in'|'up'}){
  return <div className="auth-layout" style={{minHeight:'100dvh'}}>
    <div className="auth-intro" style={{background:'#292538',color:'#f6f1e8',padding:'clamp(30px,6vw,85px)',display:'flex',flexDirection:'column',justifyContent:'space-between',minHeight:430}}>
      <Link href="/" style={{fontSize:23,fontWeight:700,letterSpacing:'-.07em'}} data-testid="link-auth-home">atlas<span style={{color:'#e6a381'}}>.</span></Link>
      <div><div className="eyebrow" style={{color:'#dda280'}}>A PRIVATE PLACE TO THINK CLEARLY</div><h1 style={{fontSize:'clamp(50px,5.5vw,85px)',letterSpacing:'-.07em',lineHeight:'.97',margin:'20px 0'}}>Your work.<br/><span className="serif" style={{color:'#dce8ae'}}>Your account.</span></h1><p style={{color:'#ada7b8',fontSize:14,lineHeight:1.7,maxWidth:370}}>A workspace that begins blank and takes shape only through what you choose to share and review.</p></div>
      <div style={{display:'flex',alignItems:'center',gap:8,color:'#b7b0be',fontSize:11}}><ShieldCheck size={15}/> Evidence first. Human always.</div>
    </div>
    <div style={{padding:'60px 22px',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:25}}>
      <div style={{width:'min(430px,100%)'}}><Link href="/" className="btn btn-quiet" data-testid="link-back-home"><ArrowLeft/> Back to Atlas</Link></div>
      {mode==='in'?<SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/>:<SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/>}
    </div>
  </div>;
}
function Home(){return <><Show when="signed-in"><Redirect to="/overview"/></Show><Show when="signed-out"><Landing/></Show></>;}
function Workspace({children}:{children:ReactNode}){
  const session=useGetAtlasSession();
  if(session.isLoading)return <div style={{minHeight:'100dvh',padding:'15vw'}}><Load count={3}/></div>;
  if(session.isError)return <div style={{maxWidth:550,margin:'18vh auto',padding:24}}><ErrorState retry={()=>session.refetch()}/></div>;
  if(!session.data?.workspace)return <Onboarding/>;
  return <Shell workspace={session.data.workspace.name}>{children}</Shell>;
}
function Protected({children}:{children:ReactNode}){return <><Show when="signed-in"><Workspace>{children}</Workspace></Show><Show when="signed-out"><Redirect to="/"/></Show></>;}
function Routed({children}:{children:ReactNode}){const [location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;}
function NotFound(){return <div style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:25,textAlign:'center'}}><div><div className="eyebrow">404 / NOT FOUND</div><h1 className="page-title">This path goes <em>nowhere.</em></h1><p className="page-lede" style={{margin:'0 auto 24px'}}>There is no page at this address. Your workspace is still where you left it.</p><Link href="/overview" className="btn btn-primary" data-testid="link-not-found-overview">Go to workspace</Link></div></div>;}
function Routes(){return <Routed><Switch>
  <Route path="/" component={Home}/>
  <Route path="/sign-in/*?">{<AuthPage mode="in"/>}</Route>
  <Route path="/sign-up/*?">{<AuthPage mode="up"/>}</Route>
  <Route path="/overview">{<Protected><Overview/></Protected>}</Route>
  <Route path="/twin">{<Protected><Twin/></Protected>}</Route>
  <Route path="/sources">{<Protected><Sources/></Protected>}</Route>
  <Route path="/meetings">{<Protected><Meetings/></Protected>}</Route>
  <Route path="/decisions">{<Protected><Decisions/></Protected>}</Route>
  <Route path="/memory">{<Protected><Memory/></Protected>}</Route>
  <Route path="/activity">{<Protected><Activity/></Protected>}</Route>
  <Route component={NotFound}/>
</Switch></Routed>;}
function ClerkRoutes(){
  const [,setLocation]=useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{signIn:{start:{title:'Welcome back',subtitle:'Return to your private Atlas workspace'}},signUp:{start:{title:'Begin on your terms',subtitle:'Your workspace starts empty'}}}}
    routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
    <QueryClientProvider client={queryClient}><CacheResetOnUserChange/><Routes/></QueryClientProvider>
  </ClerkProvider>;
}
function App(){return <WouterRouter base={basePath}><ClerkRoutes/></WouterRouter>;}
export default App;