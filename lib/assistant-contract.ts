export const assistantProviders=["codex","ollama","claude"] as const;
export type AssistantProvider=typeof assistantProviders[number];

export type AssistantHistoryItem={role:"user"|"assistant";content:string};
export type AssistantRequest={
  provider:AssistantProvider;
  projectId:string;
  question:string;
  model?:string;
  focusRecordId?:string;
  history?:AssistantHistoryItem[];
};

export type AssistantCitation={id:string;note:string};
export type AssistantPresentationStep={id:string;note:string};
export type AssistantUiAction=
  | {type:"open_record";id:string;reason:string}
  | {type:"show_path";focus_id:string;depth:1|2;reason:string}
  | {type:"present_path";steps:AssistantPresentationStep[];reason:string};

export type AssistantResponse={
  schema_version:"research-os-assistant-response-v1";
  provider:AssistantProvider;
  answer:string;
  citations:AssistantCitation[];
  ui_actions:AssistantUiAction[];
  boundary_note:string;
};

const stableId=/^(?:PAP|IDEA|CLM|HYP|EXP|RES|MOD|ENT|TOP|SRC|METHOD|DEC|EVD|POL|PRJ)-\d{3}$/;

function text(value:unknown,max:number){return typeof value==="string"?value.trim().slice(0,max):"";}

export function validateAssistantRequest(value:unknown):AssistantRequest{
  if(!value||typeof value!=="object")throw new Error("Assistant request must be an object");
  const item=value as Record<string,unknown>;
  const provider=String(item.provider||"") as AssistantProvider;
  if(!assistantProviders.includes(provider))throw new Error("Unknown assistant provider");
  const projectId=text(item.projectId,80);
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/i.test(projectId))throw new Error("Invalid project ID");
  const question=text(item.question,4_000);
  if(question.length<2)throw new Error("Ask a question before sending");
  const focusRecordId=text(item.focusRecordId,32);
  if(focusRecordId&&!stableId.test(focusRecordId))throw new Error("Invalid focus record ID");
  const rawHistory=Array.isArray(item.history)?item.history.slice(-6):[];
  const history=rawHistory.flatMap(entry=>{
    if(!entry||typeof entry!=="object")return [];
    const role=(entry as Record<string,unknown>).role;
    const content=text((entry as Record<string,unknown>).content,3_000);
    return (role==="user"||role==="assistant")&&content?[{role,content} as AssistantHistoryItem]:[];
  });
  const model=text(item.model,120);
  if(model&&!/^[a-z0-9._:/-]+$/i.test(model))throw new Error("Invalid local model name");
  return {provider,projectId,question,...model?{model}:{},...focusRecordId?{focusRecordId}:{},...history.length?{history}:{}};
}

export function validateAssistantResponse(value:unknown,provider:AssistantProvider,allowedIds:Iterable<string>):AssistantResponse{
  if(!value||typeof value!=="object")throw new Error("Assistant returned no structured response");
  const item=value as Record<string,unknown>;
  const allowed=new Set(allowedIds);
  const answer=text(item.answer,12_000);
  if(!answer)throw new Error("Assistant returned an empty answer");
  const citations=(Array.isArray(item.citations)?item.citations:[]).slice(0,12).flatMap(value=>{
    if(!value||typeof value!=="object")return [];
    const id=text((value as Record<string,unknown>).id,32);
    if(!allowed.has(id))return [];
    return [{id,note:text((value as Record<string,unknown>).note,500)||"Referenced canonical record"}];
  });
  const ui_actions=(Array.isArray(item.ui_actions)?item.ui_actions:[]).slice(0,4).flatMap(value=>{
    if(!value||typeof value!=="object")return [];
    const action=value as Record<string,unknown>;
    const reason=text(action.reason,300)||"Show relevant project context";
    if(action.type==="open_record"){
      const id=text(action.id,32);
      return allowed.has(id)?[{type:"open_record",id,reason} as AssistantUiAction]:[];
    }
    if(action.type==="show_path"){
      const focus_id=text(action.focus_id,32);
      const depth=Number(action.depth)===2?2:1;
      return allowed.has(focus_id)?[{type:"show_path",focus_id,depth,reason} as AssistantUiAction]:[];
    }
    if(action.type==="present_path"){
      const seen=new Set<string>();
      const steps=(Array.isArray(action.steps)?action.steps:[]).slice(0,8).flatMap(value=>{
        if(!value||typeof value!=="object")return [];
        const id=text((value as Record<string,unknown>).id,32);
        if(!allowed.has(id)||seen.has(id))return [];
        seen.add(id);
        return [{id,note:text((value as Record<string,unknown>).note,300)||"Explain this step"}];
      });
      return steps.length>=2?[{type:"present_path",steps,reason} as AssistantUiAction]:[];
    }
    return [];
  });
  return {
    schema_version:"research-os-assistant-response-v1",
    provider,
    answer,
    citations,
    ui_actions,
    boundary_note:text(item.boundary_note,500)||"This response is agent-generated routing and analysis, not human review or canonical scientific evidence.",
  };
}
