"use client";

import {useEffect,useRef,useState,type FormEvent, type KeyboardEvent as ReactKeyboardEvent} from "react";
import type {AssistantHistoryItem,AssistantProvider,AssistantResponse,AssistantUiAction} from "../lib/assistant-contract";
import {LocalVoiceCapture,requestMicrophonePermission} from "./local-voice-capture";

type RecordRef={id:string;type:string;title:string};
type ProviderStatus={id:AssistantProvider;label:string;available:boolean;detail:string;models?:string[];canStart?:boolean;localOnly?:boolean;externalContext?:boolean};
type Message={role:"user"|"assistant";content:string;response?:AssistantResponse};

export default function AgentCommandDock(props:{
  open:boolean;
  onClose:()=>void;
  projectId:string;
  projectName:string;
  focus?:RecordRef;
  records:RecordRef[];
  getAuthHeaders:()=>Promise<Record<string,string>>;
  onPresent:(action:AssistantUiAction)=>void;
  onOpenRecord:(id:string)=>void;
}){
  const {open,onClose,projectId,projectName,focus,records,getAuthHeaders,onPresent,onOpenRecord}=props;
  const [providers,setProviders]=useState<ProviderStatus[]>([]);
  const [providersLoading,setProvidersLoading]=useState(true);
  const [provider,setProvider]=useState<AssistantProvider>("codex");
  const [model,setModel]=useState("");
  const [externalContextApproved,setExternalContextApproved]=useState(false);
  const [messages,setMessages]=useState<Message[]>([]);
  const [question,setQuestion]=useState("");
  const [busy,setBusy]=useState(false);
  const [startingLocal,setStartingLocal]=useState(false);
  const [error,setError]=useState("");
  const [followAlong,setFollowAlong]=useState(true);
  const [voiceStatus,setVoiceStatus]=useState<{available:boolean;detail:string;maxSeconds?:number}>({available:false,detail:"Checking local voice…"});
  const [voicePermission,setVoicePermission]=useState(false);
  const [recording,setRecording]=useState(false);
  const [transcribing,setTranscribing]=useState(false);
  const [transcriptReady,setTranscriptReady]=useState(false);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const dialogRef=useRef<HTMLElement>(null);
  const openerRef=useRef<HTMLElement|null>(null);
  const wasOpenRef=useRef(false);
  const scrollRef=useRef<HTMLDivElement>(null);
  const requestControllerRef=useRef<AbortController|null>(null);
  const voiceCaptureRef=useRef<LocalVoiceCapture|null>(null);
  const voiceTimerRef=useRef<number|undefined>(undefined);
  const voiceHeldRef=useRef(false);

  useEffect(()=>{
    if(!open)return;
    let cancelled=false;
    if(!wasOpenRef.current){
      const active=document.activeElement;
      openerRef.current=active instanceof HTMLElement?active:null;
    }
    queueMicrotask(()=>{if(!cancelled)setProvidersLoading(true);});
    fetch("/api/assistant/providers",{cache:"no-store"})
      .then(async response=>response.ok?await response.json() as {providers?:ProviderStatus[]}:Promise.reject(new Error("Provider check failed")))
      .then(payload=>{
        if(cancelled)return;
        const next=payload.providers||[];setProviders(next);setProvidersLoading(false);
        const first=next.find(item=>item.available);if(first){setProvider(first.id);setModel(first.models?.[0]||"");}
      })
      .catch(()=>{if(!cancelled){setProviders([]);setProvidersLoading(false);}});
    fetch("/api/assistant/voice/status",{cache:"no-store"}).then(async response=>response.ok?await response.json() as {available:boolean;detail:string;maxSeconds?:number}:Promise.reject()).then(status=>{if(!cancelled)setVoiceStatus(status);}).catch(()=>{if(!cancelled)setVoiceStatus({available:false,detail:"Local voice unavailable"});});
    const focusTimer=window.setTimeout(()=>{
      if(inputRef.current&&!inputRef.current.disabled)inputRef.current.focus();
      else dialogRef.current?.focus();
    },180);
    wasOpenRef.current=true;
    return()=>{cancelled=true;window.clearTimeout(focusTimer);};
  },[open]);

  useEffect(()=>{
    if(open||!wasOpenRef.current)return;
    wasOpenRef.current=false;
    const opener=openerRef.current;
    openerRef.current=null;
    if(opener&&opener.isConnected&&!opener.hasAttribute("disabled"))window.setTimeout(()=>opener.focus(),0);
  },[open]);

  useEffect(()=>()=>{window.clearTimeout(voiceTimerRef.current);voiceCaptureRef.current?.discard();},[]);

  useEffect(()=>{scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:"smooth"});},[messages,busy]);

  function handleDialogKeyDown(event:ReactKeyboardEvent<HTMLElement>){
    if(event.key==="Escape"){
      if(!busy){event.preventDefault();onClose();}
      return;
    }
    if(event.key!=="Tab")return;
    const focusable=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )||[]).filter(element=>element.getAttribute("aria-hidden")!=="true");
    if(!focusable.length){event.preventDefault();dialogRef.current?.focus();return;}
    const first=focusable[0];
    const last=focusable[focusable.length-1];
    const inside=!!dialogRef.current?.contains(document.activeElement);
    if(!inside){event.preventDefault();(event.shiftKey?last:first).focus();}
    else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }

  async function ask(event:FormEvent){
    event.preventDefault();
    const trimmed=question.trim();
    if(!trimmed||busy||!externalContextApproved)return;
    const userMessage:Message={role:"user",content:trimmed};
    const history:AssistantHistoryItem[]=messages.slice(-6).map(item=>({role:item.role,content:item.content}));
    setMessages(current=>[...current,userMessage]);setQuestion("");setBusy(true);setError("");
    const controller=new AbortController();requestControllerRef.current=controller;
    try{
      const response=await fetch("/api/assistant/ask",{
        method:"POST",headers:await getAuthHeaders(),
        signal:controller.signal,
        body:JSON.stringify({provider,projectId,question:trimmed,model:provider==="ollama"?model:undefined,focusRecordId:focus?.id,history}),
      });
      const payload=await response.json() as {result?:AssistantResponse;error?:string};
      if(!response.ok||!payload.result)throw new Error(payload.error||"The assistant could not answer");
      const result=payload.result;
      setMessages(current=>[...current,{role:"assistant",content:result.answer,response:result}]);
      if(followAlong&&result.ui_actions[0])onPresent(result.ui_actions[0]);
    }catch(caught){setError(controller.signal.aborted?(provider==="ollama"?"Stopped by you. Local generation was cancelled and no project files were changed.":"Stopped by you. The complete agent process tree was terminated and no project files were changed."):caught instanceof Error?caught.message:"The assistant could not answer");}
    finally{if(requestControllerRef.current===controller)requestControllerRef.current=null;setBusy(false);}
  }

  function stopAnswer(){requestControllerRef.current?.abort();}

  async function enableVoice(){
    setError("");
    try{await requestMicrophonePermission();setVoicePermission(true);}
    catch(caught){setError(caught instanceof Error?caught.message:"Microphone permission was not granted");}
  }

  async function startVoice(){
    if(!voiceStatus.available||!voicePermission||recording||transcribing)return;
    setError("");setTranscriptReady(false);
    try{
      const capture=new LocalVoiceCapture();await capture.start();
      if(!voiceHeldRef.current){capture.discard();return;}
      voiceCaptureRef.current=capture;setRecording(true);
      voiceTimerRef.current=window.setTimeout(()=>{voiceHeldRef.current=false;void stopVoice();},(voiceStatus.maxSeconds||30)*1_000);
    }catch(caught){voiceCaptureRef.current?.discard();voiceCaptureRef.current=null;setError(caught instanceof Error?caught.message:"Microphone capture failed");}
  }

  async function stopVoice(){
    if(!voiceCaptureRef.current)return;
    window.clearTimeout(voiceTimerRef.current);setRecording(false);setTranscribing(true);
    const capture=voiceCaptureRef.current;voiceCaptureRef.current=null;
    try{
      const audio=await capture.stop();
      const headers=await getAuthHeaders();
      const response=await fetch("/api/assistant/voice/transcribe",{method:"POST",headers:{...headers,"content-type":"audio/wav"},body:audio});
      const payload=await response.json() as {transcript?:string;error?:string;audio_retained?:boolean};
      if(!response.ok||!payload.transcript)throw new Error(payload.error||"Local transcription failed");
      setQuestion(payload.transcript);setTranscriptReady(true);window.setTimeout(()=>inputRef.current?.focus(),30);
    }catch(caught){setError(caught instanceof Error?caught.message:"Local transcription failed");}
    finally{setTranscribing(false);}
  }

  const selectedProvider=providers.find(item=>item.id===provider);
  const consentKey=`research-os:assistant-context:${projectId}:${provider}`;
  useEffect(()=>{
    let cancelled=false;
    queueMicrotask(()=>{if(!cancelled)setExternalContextApproved(!selectedProvider?.externalContext||window.localStorage.getItem(consentKey)==="approved");});
    return()=>{cancelled=true;};
  },[consentKey,selectedProvider?.externalContext]);
  const recordMap=new Map(records.map(record=>[record.id,record]));

  async function startLocalModels(){
    if(startingLocal)return;
    setStartingLocal(true);setError("");
    try{
      const response=await fetch("/api/assistant/ollama/start",{method:"POST",headers:await getAuthHeaders()});
      const payload=await response.json() as {models?:string[];error?:string};
      if(!response.ok)throw new Error(payload.error||"Local models could not be started");
      const statusResponse=await fetch("/api/assistant/providers",{cache:"no-store"});
      const statusPayload=await statusResponse.json() as {providers?:ProviderStatus[]};
      const next=statusPayload.providers||[];setProviders(next);setProvider("ollama");
      const local=next.find(item=>item.id==="ollama");setModel(local?.models?.[0]||payload.models?.[0]||"");
    }catch(caught){setError(caught instanceof Error?caught.message:"Local models could not be started");}
    finally{setStartingLocal(false);}
  }

  if(!open)return null;

  return <>
    <div className={`agent-dock-scrim ${open?"open":""}`} aria-hidden="true" onClick={()=>{if(!busy)onClose();}}/>
    <aside ref={dialogRef} tabIndex={-1} onKeyDown={handleDialogKeyDown} className={`agent-command-dock ${open?"open":""}`} role="dialog" aria-modal="true" aria-labelledby="agent-command-dock-title">
      <header>
        <div><span className="eyebrow">Project-aware assistant</span><h2 id="agent-command-dock-title">Ask Research OS</h2></div>
        <button type="button" aria-label="Close assistant" disabled={busy} onClick={onClose}>×</button>
      </header>
      <div className="agent-dock-context">
        <span><i className={selectedProvider?.available?"connected":""}/>{providersLoading?"Checking agents…":selectedProvider?.available?selectedProvider.label:"No agent connected"}</span>
        <span>{projectName}</span>
        {focus&&<button onClick={()=>onOpenRecord(focus.id)}><b>{focus.id}</b>{focus.title}</button>}
      </div>
      {!providersLoading&&<div className="agent-provider-controls">
        <label><span>Reasoning agent</span><select aria-label="Reasoning agent" value={provider} disabled={busy||startingLocal} onChange={event=>{const next=event.target.value as AssistantProvider;setProvider(next);setModel(providers.find(item=>item.id===next)?.models?.[0]||"");}}>{providers.map(item=><option key={item.id} value={item.id}>{item.label}{item.available?"":" — unavailable"}</option>)}</select></label>
        {provider==="ollama"&&selectedProvider?.models?.length?<label><span>Local model</span><select aria-label="Local model" value={model} disabled={busy} onChange={event=>setModel(event.target.value)}>{selectedProvider.models.map(item=><option key={item} value={item}>{item}</option>)}</select></label>:null}
        <div className="agent-provider-detail"><span>{selectedProvider?.detail||"Provider status unavailable"}{selectedProvider?.localOnly?" · context stays on this computer":selectedProvider?.externalContext?" · bounded project context is sent to this provider":""}</span>{selectedProvider?.canStart&&<button type="button" disabled={startingLocal} onClick={startLocalModels}>{startingLocal?"Starting…":"Start local models"}</button>}</div>
        {selectedProvider?.externalContext&&!externalContextApproved?<label className="agent-context-consent"><input type="checkbox" onChange={event=>{if(event.target.checked){window.localStorage.setItem(consentKey,"approved");setExternalContextApproved(true);}}}/><span>Allow this provider to receive the bounded project context needed to answer.</span></label>:null}
      </div>}
      <div className="agent-dock-messages" ref={scrollRef} aria-live="polite">
        {!messages.length&&<div className="agent-dock-empty"><strong>Ask from where you are.</strong><p>The agent receives this project and the selected record as context. It can open a cited record or reveal its evidence path without changing canonical Markdown.</p><div><button onClick={()=>setQuestion("What is the weakest arrow in the current model?")}>Weakest arrow</button><button onClick={()=>setQuestion("Show me the strongest evidence and the main contradiction.")}>Evidence and contradiction</button></div></div>}
        {messages.map((message,index)=><article key={`${message.role}-${index}`} className={message.role}>
          <span>{message.role==="user"?"You":selectedProvider?.label||"Agent"}</span>
          <p>{message.content}</p>
          {message.response?.citations.length?<div className="agent-dock-citations">{message.response.citations.map(citation=>{const record=recordMap.get(citation.id);return <button key={citation.id} title={citation.note} onClick={()=>onOpenRecord(citation.id)}><b>{citation.id}</b>{record?.title||citation.note}</button>;})}</div>:null}
          {message.response?.ui_actions.length?<div className="agent-dock-actions">{message.response.ui_actions.map((action,actionIndex)=><button key={`${action.type}-${actionIndex}`} onClick={()=>onPresent(action)}>{action.type==="show_path"?`Show ${action.depth}-hop path`:action.type==="present_path"?`Present ${action.steps.length}-step path`:`Open ${action.id}`}</button>)}</div>:null}
          {message.response&&<small>{message.response.boundary_note}</small>}
        </article>)}
        {busy&&<div className="agent-dock-thinking"><i/><i/><i/><span>{selectedProvider?.label||"The agent"} is reading the bounded project context…</span><button type="button" onClick={stopAnswer}>Stop</button></div>}
        {error&&<div className="agent-dock-error" role="alert"><strong>Question stopped safely.</strong><span>{error}</span></div>}
      </div>
      <form onSubmit={ask}>
        {transcriptReady&&<div className="agent-transcript-ready" role="status"><b>Transcript ready.</b> Review it before pressing Ask. The audio was not retained.</div>}
        <div className="agent-dock-compose">
          <textarea ref={inputRef} value={question} disabled={busy||providersLoading||!selectedProvider?.available||!externalContextApproved} onChange={event=>setQuestion(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}}} placeholder={providersLoading?"Checking local agents…":!externalContextApproved?"Approve bounded context sharing above":selectedProvider?.available?"Ask about this project…":"Install or connect a supported local agent first"}/>
          <button type="button" className={`agent-voice ${recording?"recording":""}`} disabled={busy||transcribing||!voiceStatus.available} aria-label={!voiceStatus.available?voiceStatus.detail:!voicePermission?"Enable microphone":recording?"Release to transcribe":"Hold to talk"} title={!voiceStatus.available?voiceStatus.detail:!voicePermission?"Enable microphone for local transcription":recording?"Release to transcribe":"Hold to talk; audio stays local"} onClick={()=>{if(!voicePermission)void enableVoice();}} onPointerDown={event=>{if(voicePermission){voiceHeldRef.current=true;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);void startVoice();}}} onPointerUp={()=>{voiceHeldRef.current=false;if(voicePermission)void stopVoice();}} onPointerCancel={()=>{voiceHeldRef.current=false;if(voicePermission)void stopVoice();}} onKeyDown={event=>{if(voicePermission&&!event.repeat&&(event.key===" "||event.key==="Enter")){voiceHeldRef.current=true;event.preventDefault();void startVoice();}}} onKeyUp={event=>{if(voicePermission&&(event.key===" "||event.key==="Enter")){voiceHeldRef.current=false;event.preventDefault();void stopVoice();}}}>{transcribing?"…":recording?"●":"Mic"}</button>
          <button className="agent-dock-send" disabled={busy||!question.trim()||!selectedProvider?.available||!externalContextApproved}>{busy?"Working…":"Ask"}</button>
        </div>
        <footer><label><input type="checkbox" checked={followAlong} onChange={event=>setFollowAlong(event.target.checked)}/> Follow cited nodes</label><span>{voiceStatus.available?"Local voice ready · ":""}Read-only · 2-minute limit · Ctrl J</span></footer>
      </form>
    </aside>
  </>;
}
