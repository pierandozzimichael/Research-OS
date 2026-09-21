import {execFile,spawn,type ChildProcess} from "node:child_process";

export type BoundedProcessOptions={
  cwd:string;
  timeout:number;
  signal?:AbortSignal;
  maxBuffer?:number;
};

async function terminateWindowsTree(pid:number){
  await new Promise<void>(resolve=>{
    execFile("taskkill.exe",["/PID",String(pid),"/T","/F"],{windowsHide:true,timeout:5_000},()=>resolve());
  });
}

export async function terminateProcessTree(child:ChildProcess){
  if(!child.pid||child.exitCode!==null)return;
  if(process.platform==="win32"){
    await terminateWindowsTree(child.pid);
    if(child.exitCode===null)child.kill();
    return;
  }
  child.kill("SIGTERM");
  await new Promise(resolve=>setTimeout(resolve,250));
  if(child.exitCode===null)child.kill("SIGKILL");
}

export function runBoundedProcess(command:string,args:string[],options:BoundedProcessOptions){
  return new Promise<{stdout:string;stderr:string}>((resolve,reject)=>{
    const child=spawn(command,args,{cwd:options.cwd,windowsHide:true,stdio:["ignore","pipe","pipe"]});
    const maxBuffer=options.maxBuffer??2_000_000;
    let stdout="",stderr="",stopError:Error|undefined,stopping=false;
    const timer=setTimeout(()=>stop(new Error("Local assistant timed out")),options.timeout);
    const onAbort=()=>stop(new Error("Local assistant was stopped"));

    function append(current:string,chunk:Buffer){
      const next=current+chunk.toString("utf8");
      if(Buffer.byteLength(next,"utf8")>maxBuffer){
        void stop(new Error("Local assistant exceeded its output limit"));
        return current;
      }
      return next;
    }

    async function stop(error:Error){
      if(stopping||child.exitCode!==null)return;
      stopping=true;stopError=error;
      await terminateProcessTree(child);
    }

    child.stdout?.on("data",chunk=>{stdout=append(stdout,chunk as Buffer);});
    child.stderr?.on("data",chunk=>{stderr=append(stderr,chunk as Buffer);});
    child.once("error",error=>{stopError=error;});
    child.once("close",code=>{
      clearTimeout(timer);options.signal?.removeEventListener("abort",onAbort);
      if(stopError){reject(stopError);return;}
      if(code!==0){reject(new Error((stderr||stdout||`Local assistant exited with code ${code}`).trim()));return;}
      resolve({stdout,stderr});
    });
    if(options.signal?.aborted)void stop(new Error("Local assistant was stopped"));
    else options.signal?.addEventListener("abort",onAbort,{once:true});
  });
}
