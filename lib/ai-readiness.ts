import {readFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import path from "node:path";
import {canonicalSourceHash,markdownRecords} from "./canonical-record-files.ts";
import {researchToolCatalog} from "./research-tool-catalog.ts";

export const AI_MANIFEST_SCHEMA="research-os-ai-manifest-v1";
export const READINESS_SCHEMA="research-os-readiness-v1";

type ProjectRegistry={version:number;projects:Array<{id:string;name:string;description?:string;vaultPath:string}>};
type CheckStatus="pass"|"warn"|"fail";
export type ReadinessCheck={id:string;status:CheckStatus;message:string;path?:string;remediation?:string};

const slash=(value:string)=>value.replaceAll("\\","/");
const present=(root:string,relative:string)=>existsSync(path.join(root,relative));
const readJson=async(relative:string,root:string)=>JSON.parse(await readFile(path.join(root,relative),"utf8"));

export async function buildAiManifest(root=process.cwd()){
  const [pkg,registry]=await Promise.all([
    readJson("package.json",root) as Promise<{name:string;version:string;scripts?:Record<string,string>}>,
    readJson("projects.json",root) as Promise<ProjectRegistry>,
  ]);
  const scripts=pkg.scripts??{};
  return {
    schema_version:AI_MANIFEST_SCHEMA,
    application:{name:pkg.name,version:pkg.version},
    project_registry:{path:"projects.json",version:registry.version},
    instructions:[
      {path:"START_HERE.md",role:"portable-entrypoint",required:true},
      {path:"AGENTS.md",role:"shared-agent-contract",required:true},
      {path:"CLAUDE.md",role:"claude-adapter",required:true},
      {path:"CURRENT_STATE.md",role:"human-curated-current-state",required:true},
      {path:"NEXT_ACTIONS.md",role:"live-priority-routing",required:true},
      {path:"TRAPS.md",role:"active-negative-knowledge",required:true},
    ],
    projects:registry.projects.map(project=>({
      id:project.id,
      name:project.name,
      description:project.description??"",
      vault_path:slash(project.vaultPath),
      canonical_dashboard:slash(path.join(project.vaultPath,"00 Dashboard","PROJECT.md")),
      generated_manifest:slash(path.join(project.vaultPath,"14 AI Workspace","generated","MANIFEST.json")),
      operational_runs:slash(path.join(project.vaultPath,"14 AI Workspace","runs")),
      literature_staging:slash(path.join(project.vaultPath,"01 Inbox","Literature")),
    })),
    state_boundaries:{
      canonical:{root:"<project.vault_path>",authority:"accepted project state; cite canonical records and evidence anchors"},
      generated:{root:"<project.vault_path>/14 AI Workspace/generated",authority:"rebuildable navigation; never evidence"},
      operational:{root:"<project.vault_path>/14 AI Workspace/runs",authority:"non-canonical run history and handoffs"},
      staging:{root:"<project.vault_path>/01 Inbox/Literature",authority:"candidate material; never canonical evidence"},
      proposals:{root:".research-os/proposals",authority:"suggested changes awaiting validation or authorization"},
      scratch:{root:".research-os/scratch",authority:"disposable per-agent state; never evidence"},
    },
    commands:{
      readiness:scripts["ai:doctor"]?"pnpm ai:doctor":null,
      manifest:scripts["ai:manifest"]?"pnpm ai:manifest":null,
      sync:scripts["ai:sync"]?"pnpm ai:sync":null,
      freshness:scripts["ai:check"]?"pnpm ai:check":null,
      schema_validation:scripts["schema:validate"]?"pnpm schema:validate":null,
      research_cli:scripts["research:tool"]?"pnpm research:tool":null,
      mcp_server:scripts["research:mcp"]?"pnpm research:mcp":null,
    },
    tools:researchToolCatalog.map(tool=>({id:tool.id,boundary:tool.boundary,mcp_name:tool.mcpName??null})),
    client_adapters:[
      {client:"codex",path:".codex/config.toml",required:false},
      {client:"claude-code",path:".mcp.json",required:false},
      {client:"portable-skills",path:".agents/skills",required:false},
      {client:"claude-skills",path:".claude/skills",required:false},
    ],
  };
}

export async function inspectAiReadiness(root=process.cwd()){
  const checks:ReadinessCheck[]=[];
  const add=(check:ReadinessCheck)=>checks.push(check);
  let expectedManifest:Awaited<ReturnType<typeof buildAiManifest>>;
  try{expectedManifest=await buildAiManifest(root);}
  catch(error){
    add({id:"configuration",status:"fail",message:`Cannot load package.json or projects.json: ${error instanceof Error?error.message:String(error)}`});
    return summarize(checks,[]);
  }

  for(const instruction of expectedManifest.instructions){
    const exists=present(root,instruction.path);
    add({
      id:`instruction:${instruction.path}`,
      status:exists?"pass":instruction.required?"fail":"warn",
      message:exists?`${instruction.path} is available.`:`${instruction.path} is ${instruction.required?"required":"recommended"} but missing.`,
      path:instruction.path,
      remediation:exists?undefined:`Add ${instruction.path} when its information-state role is implemented.`,
    });
  }

  const packageScripts=(await readJson("package.json",root) as {scripts?:Record<string,string>}).scripts??{};
  for(const [name,command] of Object.entries(expectedManifest.commands)){
    const scriptName={readiness:"ai:doctor",manifest:"ai:manifest",sync:"ai:sync",freshness:"ai:check",schema_validation:"schema:validate",research_cli:"research:tool",mcp_server:"research:mcp"}[name];
    const available=Boolean(command&&scriptName&&packageScripts[scriptName]);
    add({id:`command:${name}`,status:available?"pass":"fail",message:available?`${command} is available.`:`Required ${name} command is unavailable.`});
  }

  for(const project of expectedManifest.projects){
    const vaultRoot=path.join(root,project.vault_path);
    if(!existsSync(vaultRoot)){
      add({id:`project:${project.id}`,status:"fail",message:`Project vault is missing: ${project.vault_path}.`,path:project.vault_path});
      continue;
    }
    add({id:`project:${project.id}`,status:"pass",message:`${project.name} resolves to ${project.vault_path}.`,path:project.vault_path});
    add({id:`dashboard:${project.id}`,status:present(root,project.canonical_dashboard)?"pass":"fail",message:present(root,project.canonical_dashboard)?"Canonical project dashboard is available.":"Canonical project dashboard is missing.",path:project.canonical_dashboard});
    try{
      const files=await markdownRecords(vaultRoot,{includeLiteratureBriefs:true});
      const sourceHash=canonicalSourceHash(files);
      const generated=await readJson(project.generated_manifest,root) as {sourceHash?:string};
      const current=generated.sourceHash===sourceHash;
      add({id:`freshness:${project.id}`,status:current?"pass":"fail",message:current?`Generated navigation matches canonical source ${sourceHash.slice(0,12)}.`:"Generated navigation is stale.",path:project.generated_manifest,remediation:current?undefined:"Run pnpm ai:sync."});
    }catch{
      add({id:`freshness:${project.id}`,status:"fail",message:"Generated navigation manifest is missing or unreadable.",path:project.generated_manifest,remediation:"Run pnpm ai:sync."});
    }
    add({id:`boundary:generated:${project.id}`,status:"pass",message:"Generated navigation has an explicit non-evidence boundary.",path:slash(path.dirname(project.generated_manifest))});
    add({id:`boundary:runs:${project.id}`,status:"pass",message:"Operational runs have an explicit non-canonical boundary.",path:project.operational_runs});
    add({id:`boundary:staging:${project.id}`,status:"pass",message:"Literature inbox has an explicit staging boundary.",path:project.literature_staging});
  }

  add({id:"tools",status:researchToolCatalog.length?"pass":"fail",message:`${researchToolCatalog.length} bounded research tools are catalogued (${researchToolCatalog.filter(tool=>tool.boundary==="governed-write").length} governed-write).`});

  for(const adapter of expectedManifest.client_adapters){
    const exists=present(root,adapter.path);
    add({id:`adapter:${adapter.client}`,status:exists?"pass":"warn",message:exists?`${adapter.client} adapter is present.`:`Optional ${adapter.client} adapter is not installed.`,path:adapter.path,remediation:exists?undefined:"Add this adapter only when that client is supported and tested."});
  }

  try{
    const actual=await readJson("AI_MANIFEST.json",root);
    const current=JSON.stringify(actual)===JSON.stringify(expectedManifest);
    add({id:"root-manifest",status:current?"pass":"warn",message:current?"AI_MANIFEST.json matches canonical configuration.":"AI_MANIFEST.json is stale.",path:"AI_MANIFEST.json",remediation:current?undefined:"Run pnpm ai:manifest."});
  }catch{
    add({id:"root-manifest",status:"warn",message:"AI_MANIFEST.json has not been generated.",path:"AI_MANIFEST.json",remediation:"Run pnpm ai:manifest."});
  }
  return summarize(checks,expectedManifest.projects.map(project=>project.id));
}

function summarize(checks:ReadinessCheck[],projects:string[]){
  const counts={pass:0,warn:0,fail:0};
  for(const check of checks)counts[check.status]++;
  return {
    schema_version:READINESS_SCHEMA,
    ready:counts.fail===0,
    projects,
    summary:counts,
    checks,
  };
}
