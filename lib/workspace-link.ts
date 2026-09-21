export const workspaceViewSlugs = [
  "map","library","papers","knowledge","ideas","hypotheses","experiments","results",
  "work","paper-review","literature-inbox","review-queue","agent",
] as const;

export type WorkspaceViewSlug = typeof workspaceViewSlugs[number];
export type WorkspaceScope = "direct" | "2-hop" | "all";

export type WorkspaceLinkState = {
  project?: string;
  view?: WorkspaceViewSlug;
  record?: string;
  scope?: WorkspaceScope;
  expanded?: boolean;
};

const stableIdPattern=/^[A-Z][A-Z0-9]*-\d{3}$/;
const projectPattern=/^[a-z0-9][a-z0-9-]{0,63}$/;

function one(params:URLSearchParams,key:string){
  const value=params.get(key)?.trim();
  return value||undefined;
}

export function parseWorkspaceLink(value:string):WorkspaceLinkState{
  const params=new URLSearchParams(value.startsWith("?")?value.slice(1):value);
  const project=one(params,"project");
  const view=one(params,"view");
  const record=one(params,"record")?.toUpperCase();
  const scope=one(params,"scope");
  return {
    ...(project&&projectPattern.test(project)?{project}:{}),
    ...(view&&workspaceViewSlugs.includes(view as WorkspaceViewSlug)?{view:view as WorkspaceViewSlug}:{}),
    ...(record&&stableIdPattern.test(record)?{record}:{}),
    ...(scope&&["direct","2-hop","all"].includes(scope)?{scope:scope as WorkspaceScope}:{}),
    ...(params.get("expanded")==="1"?{expanded:true}:{}),
  };
}

export function buildWorkspaceUrl(baseUrl:string,state:WorkspaceLinkState){
  const url=new URL(baseUrl);
  if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname))throw new Error("Research OS workspace links must use a loopback host.");
  url.pathname="/";
  url.search="";
  url.hash="";
  if(state.project){
    if(!projectPattern.test(state.project))throw new Error("Invalid project ID for workspace link.");
    url.searchParams.set("project",state.project);
  }
  if(state.view){
    if(!workspaceViewSlugs.includes(state.view))throw new Error("Invalid workspace view.");
    url.searchParams.set("view",state.view);
  }
  if(state.record){
    const record=state.record.toUpperCase();
    if(!stableIdPattern.test(record))throw new Error("Invalid stable record ID for workspace link.");
    url.searchParams.set("record",record);
  }
  if(state.scope){
    if(!["direct","2-hop","all"].includes(state.scope))throw new Error("Invalid graph scope.");
    url.searchParams.set("scope",state.scope);
  }
  if(state.expanded)url.searchParams.set("expanded","1");
  return url.toString();
}

export function workspaceBaseUrl(value="http://127.0.0.1:3000/"){
  return buildWorkspaceUrl(value,{});
}
