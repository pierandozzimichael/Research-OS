import {readFile} from "node:fs/promises";
import path from "node:path";

export async function postLocalResearchApi(route,payload) {
  const port=Number((await readFile(path.resolve(".apoe-research-os.port"),"utf8")).trim());
  if(!Number.isInteger(port)||port<1||port>65_535)throw new Error("Research OS port file is invalid; start the local app first.");
  const base=`http://127.0.0.1:${port}`;
  const sessionResponse=await fetch(`${base}/api/local-session`,{
    cache:"no-store",
    signal:AbortSignal.timeout(5_000),
  });
  const session=await sessionResponse.json();
  if(!sessionResponse.ok||!session.writeToken)throw new Error(session.error||"Local write session unavailable");
  const response=await fetch(`${base}${route}`,{
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-research-os-token":session.writeToken,
    },
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(20_000),
  });
  const result=await response.json();
  if(!response.ok)throw new Error(`${result.error||"Local API request failed"}${result.errors?.length?`: ${result.errors.join(" ")}`:""}`);
  return result;
}

export function parseNamedArguments(argv) {
  const values=new Map();
  const tokens=argv.slice(2).filter(token=>token!=="--");
  for(let index=0;index<tokens.length;index+=2){
    const key=tokens[index];
    const value=tokens[index+1];
    if(!key?.startsWith("--")||!value)throw new Error(`Expected a value after ${key||"argument"}`);
    values.set(key.slice(2),value);
  }
  return values;
}
