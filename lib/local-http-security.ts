import { timingSafeEqual } from "node:crypto";

export function isLoopbackHost(hostHeader:string|undefined) {
  if(!hostHeader)return false;
  try{
    const hostname=new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g,"");
    return hostname==="127.0.0.1"||hostname==="localhost"||hostname==="::1";
  }catch{return false;}
}

export function isAllowedLocalOrigin(hostHeader:string|undefined,originHeader:string|undefined) {
  if(!isLoopbackHost(hostHeader))return false;
  if(!originHeader)return true;
  try{
    const parsed=new URL(originHeader);
    return parsed.host===hostHeader&&isLoopbackHost(parsed.host);
  }catch{return false;}
}

export function secureTokenMatches(expectedToken:string,candidate:string|undefined) {
  if(!candidate)return false;
  const expected=Buffer.from(expectedToken);
  const received=Buffer.from(candidate);
  return expected.length===received.length&&timingSafeEqual(expected,received);
}
