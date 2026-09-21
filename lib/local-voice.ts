const DEFAULT_WHISPER_URL="http://127.0.0.1:8080";

function whisperBaseUrl(){
  const value=String(process.env.RESEARCH_OS_WHISPER_URL||DEFAULT_WHISPER_URL).replace(/\/$/,"");
  const parsed=new URL(value);
  if(!["127.0.0.1","localhost","[::1]"].includes(parsed.hostname))throw new Error("Local voice must use a loopback Whisper service");
  return parsed.toString().replace(/\/$/,"");
}

function abortAfter(timeout:number,signal?:AbortSignal){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  const cancel=()=>controller.abort();
  signal?.addEventListener("abort",cancel,{once:true});
  return {signal:controller.signal,dispose(){clearTimeout(timer);signal?.removeEventListener("abort",cancel);}};
}

export async function localVoiceStatus(){
  let endpoint="";
  try{endpoint=whisperBaseUrl();}catch(error){return {available:false,detail:error instanceof Error?error.message:"Invalid local voice configuration"};}
  const guard=abortAfter(1_500);
  try{
    await fetch(`${endpoint}/`,{signal:guard.signal});
    return {available:true,detail:"Local Whisper service ready",maxSeconds:30};
  }catch{return {available:false,detail:"Local Whisper service is not running",maxSeconds:30};}
  finally{guard.dispose();}
}

function validateWav(bytes:Buffer){
  if(bytes.length<44||bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WAVE")throw new Error("Voice input must be a WAV recording");
  const audioFormat=bytes.readUInt16LE(20),channels=bytes.readUInt16LE(22),sampleRate=bytes.readUInt32LE(24),byteRate=bytes.readUInt32LE(28),bits=bytes.readUInt16LE(34);
  if(audioFormat!==1||channels<1||channels>2||sampleRate<8_000||sampleRate>96_000||![16,24,32].includes(bits)||!byteRate)throw new Error("Voice input uses an unsupported WAV format");
  const seconds=Math.max(0,(bytes.length-44)/byteRate);
  if(seconds>.5+30)throw new Error("Voice recordings are limited to 30 seconds");
  return {seconds};
}

export async function transcribeLocalWav(bytes:Buffer,signal?:AbortSignal){
  if(bytes.length>12_000_000)throw new Error("Voice recording exceeds the 12 MB safety limit");
  const {seconds}=validateWav(bytes);
  const endpoint=whisperBaseUrl();
  const form=new FormData();
  const audioBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  form.append("file",new Blob([audioBuffer],{type:"audio/wav"}),"research-os-voice.wav");
  form.append("temperature","0.0");
  form.append("response_format","json");
  const guard=abortAfter(45_000,signal);
  try{
    const response=await fetch(`${endpoint}/inference`,{method:"POST",body:form,signal:guard.signal});
    if(!response.ok)throw new Error(`Local Whisper service returned ${response.status}`);
    const raw=await response.text();
    let transcript="";
    try{const parsed=JSON.parse(raw) as {text?:unknown;transcription?:unknown};transcript=String(parsed.text||parsed.transcription||"").trim();}
    catch{transcript=raw.trim();}
    if(!transcript)throw new Error("Local Whisper returned an empty transcript");
    return {transcript:transcript.slice(0,4_000),seconds:Number(seconds.toFixed(1)),audio_retained:false};
  }catch(error){
    if(guard.signal.aborted)throw new Error("Local transcription timed out or was cancelled");
    throw error;
  }finally{guard.dispose();}
}
